require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = Number(process.env.PORT || 3000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const rooms = new Map();

function getRoomPeers(roomCode) {
  const room = io.sockets.adapter.rooms.get(roomCode);
  if (!room) return [];
  return Array.from(room.keys());
}

function updateRoomState(roomCode) {
  const peers = getRoomPeers(roomCode);
  io.to(roomCode).emit('room-state', { room: roomCode, peers });
}

function estimateFallbackRisk(transcript) {
  const normalized = transcript.toLowerCase();
  const patterns = [
    'verify your account',
    'bank security',
    'otp',
    'share the code',
    'kyc update',
    'verify identity',
    'urgent action',
    'confirm your details',
    'security check',
    'nfc card',
    'update your app',
    'suspicious activity'
  ];

  const hits = patterns.filter((p) => normalized.includes(p));
  let score = 0;
  if (hits.length > 0) score += Math.min(50, hits.length * 12);
  if (/(immediately|today|urgent|now)/i.test(normalized)) score += 12;
  if (/(bank|account|payment|wallet|otp|security)/i.test(normalized)) score += 18;
  if (/(share|send|provide|verify)/i.test(normalized)) score += 12;

  return Math.min(95, score);
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'CyberGuard AI', port: PORT });
});

app.post('/api/gemini-check', async (req, res) => {
  const transcript = String(req.body?.transcript || '').trim();

  if (!transcript) {
    return res.json({ is_scam: false, confidence: 0, reason: 'No transcript available yet.' });
  }

  if (!GEMINI_API_KEY) {
    const fallback = estimateFallbackRisk(transcript);
    return res.json({
      is_scam: fallback > 55,
      confidence: Math.round(fallback),
      reason: 'Gemini key is not configured; local fallback evaluation was used.'
    });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `You are a scam-call detector. Given this live call transcript, respond ONLY with JSON: {"is_scam": true/false, "confidence": 0-100, "reason": "short explanation"}. Transcript: ${transcript}`
                }
              ]
            }
          ]
        })
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini request failed: ${response.status} ${text}`);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const sanitized = rawText.replace(/```json|```/g, '').trim();

    let parsed = { is_scam: false, confidence: 0, reason: 'No reason returned.' };
    try {
      parsed = JSON.parse(sanitized);
    } catch (err) {
      const match = sanitized.match(/\{.*\}/s);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch (innerErr) {
          parsed.reason = 'Unable to parse Gemini response.';
        }
      }
    }

    return res.json({
      is_scam: Boolean(parsed.is_scam),
      confidence: Math.min(100, Math.max(0, Number(parsed.confidence || 0))),
      reason: String(parsed.reason || 'Gemini returned a verdict.').slice(0, 220)
    });
  } catch (error) {
    const fallback = estimateFallbackRisk(transcript);
    return res.json({
      is_scam: fallback > 55,
      confidence: Math.round(fallback),
      reason: `Gemini proxy error: ${error.message}. Fallback risk model used.`
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('join-room', (roomCode) => {
    const safeRoom = String(roomCode || 'cyberguard-room').trim() || 'cyberguard-room';
    socket.join(safeRoom);
    rooms.set(safeRoom, new Set(rooms.get(safeRoom) || []));
    rooms.get(safeRoom).add(socket.id);
    socket.emit('room-joined', { room: safeRoom, socketId: socket.id });
    updateRoomState(safeRoom);
  });

  socket.on('call-request', ({ room, to }) => {
    const roomCode = String(room || 'cyberguard-room');
    const target = to || getRoomPeers(roomCode).find((peerId) => peerId !== socket.id);
    if (!target) {
      socket.emit('call-error', { message: 'No other peer is available in this room.' });
      return;
    }
    io.to(target).emit('incoming-call', { callerId: socket.id, room: roomCode });
    socket.emit('call-requested', { to: target, room: roomCode });
  });

  socket.on('call-accept', ({ room, to }) => {
    io.to(to).emit('call-accepted', { responderId: socket.id, room });
  });

  socket.on('call-decline', ({ room, to }) => {
    io.to(to).emit('call-declined', { responderId: socket.id, room });
  });

  socket.on('webrtc-signal', ({ to, signal }) => {
    if (!to) return;
    io.to(to).emit('webrtc-signal', { from: socket.id, signal });
  });

  socket.on('security-alert', ({ room, riskScore, reason, transcript, report }) => {
    if (!room) return;
    io.to(room).emit('security-alert', {
      from: socket.id,
      riskScore,
      reason,
      transcript,
      report
    });
  });

  socket.on('security-report', ({ room, report }) => {
    if (!room) return;
    io.to(room).emit('security-report', { from: socket.id, report });
  });

  socket.on('disconnect', () => {
    for (const [roomCode, peers] of rooms.entries()) {
      if (peers.has(socket.id)) {
        peers.delete(socket.id);
        if (peers.size === 0) {
          rooms.delete(roomCode);
        }
        updateRoomState(roomCode);
      }
    }
  });
});

function startServer({ port = PORT, host = '0.0.0.0' } = {}) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      const address = server.address();
      console.log(`CyberGuard AI signaller running on http://${host}:${address.port}`);
      resolve(server);
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
