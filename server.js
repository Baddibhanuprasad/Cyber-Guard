require('dotenv').config();

const express = require('express');
const fs = require('fs');
const https = require('https');
const http = require('http');
const os = require('os');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const TLS_CERT_FILE = process.env.TLS_CERT_FILE || '';
const TLS_KEY_FILE = process.env.TLS_KEY_FILE || '';
if (Boolean(TLS_CERT_FILE) !== Boolean(TLS_KEY_FILE)) {
  throw new Error('TLS_CERT_FILE and TLS_KEY_FILE must both be configured to enable HTTPS.');
}
const protocol = TLS_CERT_FILE ? 'https' : 'http';
const server = TLS_CERT_FILE
  ? https.createServer({
      cert: fs.readFileSync(path.resolve(TLS_CERT_FILE)),
      key: fs.readFileSync(path.resolve(TLS_KEY_FILE)),
    }, app)
  : http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = Number(process.env.PORT || 3000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = 'CYB-';
  for (let i = 0; i < 4; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const defaultRoomCode = generateRoomCode();

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flatMap((interfaces) => interfaces || [])
    .filter((item) => item.family === 'IPv4' && !item.internal)
    .map((item) => item.address);
}

function getRoomPeers(roomCode) {
  const room = io.sockets.adapter.rooms.get(roomCode);
  if (!room) return [];
  return Array.from(room.keys());
}

function updateRoomState(roomCode) {
  const peers = getRoomPeers(roomCode);
  io.to(roomCode).emit('room-state', { room: roomCode, peers });
}

app.use(express.json({ limit: '10mb' })); // 10s audio base64 can be 2-4 MB
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'CyberGuard AI', port: PORT, roomCode: defaultRoomCode });
});

app.get('/api/network-info', (req, res) => {
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : PORT;
  const ips = getLanAddresses();
  res.json({
    protocol,
    port,
    ips,
    urls: ips.map((ip) => `${protocol}://${ip}:${port}`),
    defaultRoomCode,
  });
});

app.post('/api/gemini-check', async (req, res) => {
  const transcript = String(req.body?.transcript || '').trim();

  if (!transcript) {
    return res.status(400).json({ error: 'A transcript is required for analysis.' });
  }

  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: 'Gemini analysis is unavailable. Configure GEMINI_API_KEY on the host server.' });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `You are a multilingual scam-call detector supporting English, Hindi (हिन्दी), Telugu (తెలుగు), and mixed speech (Hinglish/Tenglish). Analyze this live phone call transcript for fraud, phishing, OTP scams, banking fraud, police impersonation, or lottery scams. Respond ONLY with JSON: {"is_scam": true/false, "confidence": 0-100, "reason": "short clear explanation"}. Transcript: ${transcript}`
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

    let parsed;
    try {
      parsed = JSON.parse(sanitized);
    } catch {
      const match = sanitized.match(/\{.*\}/s);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          return res.status(502).json({ error: 'Gemini returned an invalid analysis response.' });
        }
      }
    }
    if (!parsed || typeof parsed !== 'object') {
      return res.status(502).json({ error: 'Gemini returned an invalid analysis response.' });
    }
    const confidence = Number(parsed.confidence);
    if (typeof parsed.is_scam !== 'boolean' || !Number.isFinite(confidence)) {
      return res.status(502).json({ error: 'Gemini returned an invalid analysis response.' });
    }

    return res.json({
      is_scam: parsed.is_scam,
      confidence: Math.min(100, Math.max(0, confidence)),
      reason: String(parsed.reason || 'Gemini returned a verdict.').slice(0, 220)
    });
  } catch (error) {
    console.error('Gemini analysis failed:', error);
    return res.status(502).json({ error: `Gemini analysis failed: ${error.message}` });
  }
});

app.post('/api/gemini-stt', async (req, res) => {
  const audioBase64 = String(req.body?.audioBase64 || '').trim();
  const mimeType = String(req.body?.mimeType || 'audio/webm').split(';')[0].trim();

  if (!audioBase64) {
    return res.status(400).json({ error: 'Audio base64 payload is required for Gemini STT.' });
  }

  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: 'Gemini API key is unavailable on the host server.' });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: 'You are an accurate Speech-To-Text transcriber. Listen to this audio recording carefully and transcribe all spoken words into plain text. Supports Telugu (తెలుగు), Hindi (हिन्दी), English, and Hinglish/Tenglish. Output ONLY the raw transcribed text. If there is no speech, silence, or background noise only, output nothing.'
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: audioBase64
                  }
                }
              ]
            }
          ]
        })
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error('Gemini STT API Error:', response.status, text);
      throw new Error(`Gemini STT request failed: ${response.status} ${text}`);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let transcript = rawText.trim();

    // Clean up JSON wrappers if Gemini happens to wrap it
    if (transcript.startsWith('{')) {
      try {
        const obj = JSON.parse(transcript);
        transcript = obj.transcript || obj.text || transcript;
      } catch (e) {
        const m = transcript.match(/"transcript":\s*"([^"]+)"/);
        if (m) transcript = m[1];
      }
    }

    transcript = transcript.replace(/^"|"$/g, '').trim();

    if (transcript) {
      console.log('🎙️ [Gemini STT Transcribed]:', transcript);
    }

    return res.json({ transcript, language: 'auto' });
  } catch (error) {
    console.error('Gemini STT failed:', error);
    return res.status(502).json({ error: `Gemini STT failed: ${error.message}` });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  function leaveCurrentRoom() {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;
    socket.leave(roomCode);
    const peers = rooms.get(roomCode);
    if (peers) {
      peers.delete(socket.id);
      if (peers.size === 0) rooms.delete(roomCode);
    }
    socket.data.roomCode = null;
    updateRoomState(roomCode);
  }

  socket.on('join-room', (roomCode) => {
    const safeRoom = String(roomCode || '').trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(safeRoom)) {
      socket.emit('call-error', { message: 'Room codes must be 3–32 letters, numbers, or hyphens.' });
      return;
    }
    if (socket.data.roomCode === safeRoom) {
      socket.emit('room-joined', { room: safeRoom, socketId: socket.id });
      return;
    }
    leaveCurrentRoom();
    socket.join(safeRoom);
    rooms.set(safeRoom, new Set(rooms.get(safeRoom) || []));
    rooms.get(safeRoom).add(socket.id);
    socket.data.roomCode = safeRoom;
    socket.emit('room-joined', { room: safeRoom, socketId: socket.id });
    updateRoomState(safeRoom);
  });

  socket.on('call-request', ({ room, to }) => {
    const roomCode = String(room || '').trim().toUpperCase();
    if (!roomCode || socket.data.roomCode !== roomCode) {
      socket.emit('call-error', { message: 'Join the room before starting a call.' });
      return;
    }
    const target = to || getRoomPeers(roomCode).find((peerId) => peerId !== socket.id);
    if (!target) {
      socket.emit('call-error', { message: 'No other peer is available in this room.' });
      return;
    }
    if (!getRoomPeers(roomCode).includes(target)) {
      socket.emit('call-error', { message: 'The selected peer is no longer in this room.' });
      return;
    }
    io.to(target).emit('incoming-call', { callerId: socket.id, room: roomCode });
    socket.emit('call-requested', { to: target, room: roomCode });
  });

  socket.on('call-accept', ({ room, to }) => {
    if (socket.data.roomCode === room && getRoomPeers(room).includes(to)) {
      io.to(to).emit('call-accepted', { responderId: socket.id, room });
    }
  });

  socket.on('call-decline', ({ room, to }) => {
    if (to) io.to(to).emit('call-declined', { responderId: socket.id, room });
  });

  socket.on('call-end', ({ to }) => {
    if (to) io.to(to).emit('call-ended', { from: socket.id });
  });

  socket.on('webrtc-signal', ({ to, signal } = {}) => {
    if (!to || !signal || !socket.data.roomCode || !getRoomPeers(socket.data.roomCode).includes(to)) return;
    io.to(to).emit('webrtc-signal', { from: socket.id, signal });
  });

  socket.on('transcript-line', ({ to, text } = {}) => {
    if (!to || !text || !socket.data.roomCode || !getRoomPeers(socket.data.roomCode).includes(to)) return;
    io.to(to).emit('transcript-line', { from: socket.id, text: String(text).slice(0, 1000) });
  });

  socket.on('security-alert', ({ room, riskScore, reason, transcript, report } = {}) => {
    if (!room || socket.data.roomCode !== room) return;
    io.to(room).emit('security-alert', {
      from: socket.id,
      riskScore,
      reason,
      transcript,
      report
    });
  });

  socket.on('security-report', ({ room, report } = {}) => {
    if (!room || socket.data.roomCode !== room) return;
    io.to(room).emit('security-report', { from: socket.id, report });
  });

  socket.on('disconnect', () => {
    leaveCurrentRoom();
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
      const ips = getLanAddresses();
      const urls = ips.map((ip) => `${protocol}://${ip}:${address.port}`);
      const mainUrl = urls[0] || `${protocol}://127.0.0.1:${address.port}`;
      const mainIp = ips[0] || '127.0.0.1';

      console.log('\n================================================================');
      console.log('🛡️  CYBERGUARD AI - STANDALONE HOST SERVER ONLINE (LAPTOP A)');
      console.log('================================================================');
      console.log(`📡 Host Server Wi-Fi IP:     ${mainUrl}`);
      if (urls.length > 1) {
        console.log(`🔗 All LAN URLs:             ${urls.join(', ')}`);
      }
      console.log(`🔑 Generated Default Room:   ${defaultRoomCode}`);
      console.log('----------------------------------------------------------------');
      console.log('📲 CONNECTION INSTRUCTIONS FOR LAPTOP B:');
      console.log(`   1. Ensure Laptop B is on the SAME Wi-Fi network.`);
      console.log(`   2. Open browser on Laptop B: ${mainUrl}`);
      console.log(`   3. OR open CyberGuard App & enter Server IP: ${mainIp}:${address.port}`);
      console.log('================================================================\n');
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
