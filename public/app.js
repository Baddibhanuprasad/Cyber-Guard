const socket = io();

const SCAM_PATTERNS = [
  'verify your account',
  'bank security',
  'otp',
  'share the code',
  'kyc update',
  'verify identity',
  'urgent action',
  'immediately',
  'security check',
  'confirm your details',
  'update your app',
  'account suspension',
  'suspicious activity',
  'bank account',
  'recovery code',
  'payment link',
];

const state = {
  roomCode: 'CYB-42',
  localPeerId: null,
  activePeerId: null,
  roomPeers: [],
  analysisEnabled: true,
  callState: 'idle',
  localStream: null,
  remoteStream: null,
  peerConnection: null,
  transcript: [],
  keywordHits: [],
  geminiHistory: [],
  riskHistory: [],
  currentRisk: 0,
  detailOpen: null,
  recognition: null,
  recorder: null,
  evidenceUrl: null,
  report: null,
  callStartedAt: null,
  callTimer: null,
  muted: false,
  speakerOn: true,
  lastGeminiAt: 0,
  localConfidence: 0,
  geminiConfidence: 0,
  geminiReason: 'Waiting for first verdict...',
};

const els = {
  roomInput: document.getElementById('roomInput'),
  joinRoomBtn: document.getElementById('joinRoomBtn'),
  analysisToggle: document.getElementById('analysisToggle'),
  analysisLabel: document.getElementById('analysisLabel'),
  callStatusText: document.getElementById('callStatusText'),
  callNumber: document.getElementById('callNumber'),
  contactName: document.getElementById('contactName'),
  dialBtn: document.getElementById('dialBtn'),
  acceptCallBtn: document.getElementById('acceptCallBtn'),
  declineCallBtn: document.getElementById('declineCallBtn'),
  endCallBtn: document.getElementById('endCallBtn'),
  muteBtn: document.getElementById('muteBtn'),
  speakerBtn: document.getElementById('speakerBtn'),
  incomingPeerLabel: document.getElementById('incomingPeerLabel'),
  activePeerLabel: document.getElementById('activePeerLabel'),
  callTimer: document.getElementById('callTimer'),
  callIdleScreen: document.getElementById('callIdleScreen'),
  callIncomingScreen: document.getElementById('callIncomingScreen'),
  callActiveScreen: document.getElementById('callActiveScreen'),
  alertOverlay: document.getElementById('alertOverlay'),
  pipelineState: document.getElementById('pipelineState'),
  analysisDisabledBanner: document.getElementById('analysisDisabledBanner'),
  detailModal: document.getElementById('detailModal'),
  detailTitle: document.getElementById('detailTitle'),
  detailContent: document.getElementById('detailContent'),
  closeDetailBtn: document.getElementById('closeDetailBtn'),
  captureWaveform: document.getElementById('captureWaveform'),
  captureSummary: document.getElementById('captureSummary'),
  sttSummary: document.getElementById('sttSummary'),
  localScoreDisplay: document.getElementById('localScoreDisplay'),
  localHitsSummary: document.getElementById('localHitsSummary'),
  geminiScoreDisplay: document.getElementById('geminiScoreDisplay'),
  geminiReasonDisplay: document.getElementById('geminiReasonDisplay'),
  riskMeterFill: document.getElementById('riskMeterFill'),
  riskScoreDisplay: document.getElementById('riskScoreDisplay'),
  riskFormulaText: document.getElementById('riskFormulaText'),
  reportStatus: document.getElementById('reportStatus'),
  reportSummary: document.getElementById('reportSummary'),
};

function setRoomCode(value) {
  const code = String(value || '').trim().toUpperCase() || 'CYB-42';
  state.roomCode = code;
  els.roomInput.value = code;
}

function updateToggleUi() {
  const enabled = state.analysisEnabled;
  els.analysisToggle.classList.toggle('on', enabled);
  els.analysisToggle.setAttribute('aria-pressed', String(enabled));
  els.analysisLabel.textContent = enabled ? 'ON' : 'OFF';
  els.analysisLabel.style.color = enabled ? 'var(--cyan)' : 'var(--muted)';
  els.pipelineState.textContent = enabled ? (state.callState === 'active' ? 'Monitoring' : 'Standby') : 'Disabled';
  els.pipelineState.classList.toggle('live', enabled && state.callState === 'active');
  els.pipelineState.classList.toggle('alert', state.currentRisk > 60 && enabled);
  els.analysisDisabledBanner.classList.toggle('hidden', enabled);

  document.querySelectorAll('.node').forEach((node) => {
    if (!enabled) {
      node.classList.add('dimmed');
      node.classList.remove('active', 'alert');
    } else {
      node.classList.remove('dimmed');
    }
  });

  if (!enabled) {
    hideAlertOverlay();
    els.reportStatus.textContent = 'Security Analysis Disabled';
    els.reportSummary.textContent = 'No incident recorded';
  }
}

function updateCallUi() {
  const isIncoming = state.callState === 'incoming';
  const isActive = state.callState === 'active';
  const isIdle = !isIncoming && !isActive;

  els.callIdleScreen.classList.toggle('active', isIdle);
  els.callIncomingScreen.classList.toggle('hidden', !isIncoming);
  els.callActiveScreen.classList.toggle('hidden', !isActive);
  els.callIdleScreen.classList.toggle('hidden', !isIdle);

  if (isIncoming) {
    els.callStatusText.textContent = 'Incoming';
    els.callStatusText.classList.remove('idle');
    els.callStatusText.classList.add('live');
  } else if (isActive) {
    els.callStatusText.textContent = 'Live';
    els.callStatusText.classList.remove('idle');
    els.callStatusText.classList.add('live');
  } else {
    els.callStatusText.textContent = 'Idle';
    els.callStatusText.classList.remove('live');
    els.callStatusText.classList.add('idle');
  }

  if (state.activePeerId) {
    const label = `Peer ${state.activePeerId.slice(0, 8)}`;
    els.incomingPeerLabel.textContent = label;
    els.activePeerLabel.textContent = label;
    els.callNumber.textContent = state.activePeerId;
  }

  if (!state.callState || state.callState === 'idle') {
    els.callTimer.textContent = '00:00';
  }
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function startCallTimer() {
  if (state.callTimer) clearInterval(state.callTimer);
  state.callStartedAt = Date.now();
  state.callTimer = setInterval(() => {
    if (state.callState !== 'active') {
      clearInterval(state.callTimer);
      state.callTimer = null;
      return;
    }
    const elapsed = Date.now() - state.callStartedAt;
    els.callTimer.textContent = formatDuration(elapsed);
  }, 1000);
}

function stopCallTimer() {
  if (state.callTimer) {
    clearInterval(state.callTimer);
    state.callTimer = null;
  }
  els.callTimer.textContent = '00:00';
}

function updateWaveform() {
  const bars = Array.from(els.captureWaveform.children);
  bars.forEach((bar, index) => {
    const level = state.callState === 'active' ? 28 + Math.random() * 72 : 18 + Math.random() * 24;
    bar.style.height = `${level}%`;
    bar.style.opacity = state.callState === 'active' ? '1' : '0.45';
    bar.style.animationDelay = `${index * 0.08}s`;
  });
}

function setNodeState(nodeName, active = false, alert = false) {
  const node = document.querySelector(`.node-${nodeName}`);
  if (!node) return;
  node.classList.toggle('active', active && state.analysisEnabled);
  node.classList.toggle('alert', alert && state.analysisEnabled);
  node.classList.toggle('dimmed', !state.analysisEnabled);
}

function hideAlertOverlay() {
  els.alertOverlay.classList.add('hidden');
}

function showAlertOverlay() {
  if (!state.analysisEnabled) return;
  els.alertOverlay.classList.remove('hidden');
}

function registerNodeDetails() {
  document.querySelectorAll('.node').forEach((node) => {
    node.addEventListener('click', () => {
      openDetail(node.dataset.node);
    });
  });
}

function openDetail(stage) {
  const stageMap = {
    capture: 'Call Capture',
    speech: 'Speech-to-Text',
    analysis: 'Analysis',
    risk: 'Risk Scoring',
    report: 'Report & Evidence',
  };

  const title = stageMap[stage] || 'Stage';
  els.detailTitle.textContent = title;
  els.detailModal.classList.remove('hidden');
  els.detailModal.setAttribute('aria-hidden', 'false');
  state.detailOpen = stage;
  els.detailContent.innerHTML = '';

  if (stage === 'capture') {
    const section = document.createElement('div');
    section.className = 'detail-section';
    section.innerHTML = `
      <h3>Capture</h3>
      <div class="detail-box">
        Call duration: ${state.callStartedAt ? formatDuration(Date.now() - state.callStartedAt) : '00:00'}
        <br />
        Connection: ${state.peerConnection ? 'WebRTC audio stream active' : 'Awaiting peer'}
        <br />
        Recording: ${state.evidenceUrl ? 'Evidence captured' : 'Not yet created'}
      </div>
    `;
    els.detailContent.appendChild(section);
  }

  if (stage === 'speech') {
    const section = document.createElement('div');
    section.className = 'detail-section';
    const entries = state.transcript.length ? state.transcript : [{ speaker: 'System', text: 'No transcript available yet.' }];
    section.innerHTML = '<h3>Conversation transcript</h3>';
    const box = document.createElement('div');
    box.className = 'detail-box list-grid';
    entries.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'transcript-entry';
      row.innerHTML = `<span class="transcript-speaker">${entry.speaker}</span><span>${entry.text}</span>`;
      box.appendChild(row);
    });
    section.appendChild(box);
    els.detailContent.appendChild(section);
  }

  if (stage === 'analysis') {
    const section1 = document.createElement('div');
    section1.className = 'detail-section';
    section1.innerHTML = '<h3>Local keyword matches</h3>';
    const localBox = document.createElement('div');
    localBox.className = 'detail-box';
    localBox.textContent = state.keywordHits.length ? state.keywordHits.map((hit) => `• ${hit}`).join('\n') : 'No local keyword patterns triggered yet.';
    section1.appendChild(localBox);
    els.detailContent.appendChild(section1);

    const section2 = document.createElement('div');
    section2.className = 'detail-section';
    section2.innerHTML = '<h3>Gemini verdict history</h3>';
    const geminiBox = document.createElement('div');
    geminiBox.className = 'detail-box list-grid';
    if (state.geminiHistory.length === 0) {
      geminiBox.textContent = 'No Gemini verdicts have been collected yet.';
    } else {
      state.geminiHistory.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'list-row';
        row.innerHTML = `<span>${item.ts}</span><span>${item.confidence}% • ${item.is_scam ? 'scam' : 'safe'}</span>`;
        geminiBox.appendChild(row);
      });
    }
    section2.appendChild(geminiBox);
    els.detailContent.appendChild(section2);
  }

  if (stage === 'risk') {
    const section = document.createElement('div');
    section.className = 'detail-section';
    section.innerHTML = '<h3>Score timeline</h3>';
    const box = document.createElement('div');
    box.className = 'detail-box list-grid';
    if (!state.riskHistory.length) {
      box.textContent = 'No risk scoring events yet.';
    } else {
      state.riskHistory.forEach((entry) => {
        const row = document.createElement('div');
        row.className = 'list-row';
        row.innerHTML = `<span>${entry.ts}</span><span>${entry.score}%</span>`;
        box.appendChild(row);
      });
    }
    section.appendChild(box);
    els.detailContent.appendChild(section);
  }

  if (stage === 'report') {
    const section = document.createElement('div');
    section.className = 'detail-section';
    const report = state.report || {
      caller: 'Unavailable',
      timestamp: new Date().toISOString(),
      transcript: 'No transcript recorded yet.',
      riskScore: 0,
      reason: 'No incident yet.',
      evidenceUrl: null,
    };

    section.innerHTML = `
      <h3>Incident report</h3>
      <div class="detail-box">
        Caller: ${report.caller || 'Unknown'}
        <br />
        Timestamp: ${report.timestamp || 'n/a'}
        <br />
        Risk score: ${report.riskScore || 0}%
        <br />
        Reason: ${report.reason || 'N/A'}
      </div>
      <div class="detail-box">${report.transcript || 'No transcript.'}</div>
    `;

    if (report.evidenceUrl) {
      const audio = document.createElement('audio');
      audio.className = 'audio-clip';
      audio.controls = true;
      audio.src = report.evidenceUrl;
      section.appendChild(audio);
    }

    els.detailContent.appendChild(section);
  }
}

function closeDetail() {
  els.detailModal.classList.add('hidden');
  els.detailModal.setAttribute('aria-hidden', 'true');
  state.detailOpen = null;
}

function setAnalysisEnabled(enabled) {
  state.analysisEnabled = enabled;
  updateToggleUi();
  if (!enabled) {
    stopSpeechRecognition();
    if (state.callState === 'active') {
      state.callState = 'active';
    }
  } else if (state.callState === 'active') {
    startSpeechRecognition();
  }
}

function addTranscriptLine(speaker, text) {
  const cleanText = String(text || '').trim();
  if (!cleanText) return;
  state.transcript.push({ speaker, text: cleanText, ts: new Date().toLocaleTimeString([],{hour:'2-digit', minute:'2-digit', second:'2-digit'}) });
  els.sttSummary.textContent = cleanText;
  if (state.transcript.length > 12) state.transcript.shift();
  updateLocalAnalysis();
}

function updateLocalAnalysis() {
  const combined = state.transcript.map((item) => item.text).join(' ');
  const normalized = combined.toLowerCase();
  const matches = [];
  SCAM_PATTERNS.forEach((pattern) => {
    if (normalized.includes(pattern)) matches.push(pattern);
  });
  state.keywordHits = matches;
  if (matches.length) {
    const localScore = Math.min(95, 18 + matches.length * 16 + (/(urgent|immediately|today|now)/i.test(normalized) ? 18 : 0));
    state.localConfidence = localScore;
    els.localScoreDisplay.textContent = `${Math.round(localScore)}%`;
    els.localHitsSummary.textContent = matches.slice(0, 3).join(', ');
  } else {
    state.localConfidence = 0;
    els.localScoreDisplay.textContent = '0%';
    els.localHitsSummary.textContent = 'No keyword hits';
  }

  if (state.analysisEnabled && state.callState === 'active') {
    sendGeminiCheck();
  }
}

function getRiskScore() {
  const local = Number(state.localConfidence || 0);
  const gemini = Number(state.geminiConfidence || 0);
  const urgencyBonus = /(urgent|immediately|today|now)/i.test(state.transcript.map((item) => item.text).join(' ')) ? 12 : 0;
  const combined = Math.max(local, gemini) + urgencyBonus;
  return Math.min(100, combined);
}

function refreshRiskDisplay() {
  const score = getRiskScore();
  state.currentRisk = score;
  els.riskMeterFill.style.width = `${score}%`;
  els.riskScoreDisplay.textContent = `${Math.round(score)}%`;
  els.pipelineState.classList.toggle('alert', score > 60 && state.analysisEnabled);
  els.riskFormulaText.textContent = 'Formula: max(local, Gemini) + urgency';

  if (score > 60) {
    setNodeState('risk', true, true);
    setNodeState('report', true, true);
    showAlertOverlay();
    els.reportStatus.textContent = 'Alert active';
    els.reportSummary.textContent = 'Evidence assembly started';
    state.report = {
      caller: state.activePeerId ? `Peer ${state.activePeerId.slice(0, 8)}` : 'Unknown caller',
      timestamp: new Date().toISOString(),
      transcript: state.transcript.map((item) => `${item.speaker}: ${item.text}`).join('\n'),
      riskScore: Math.round(score),
      reason: state.geminiReason || 'Suspicious call pattern detected',
      evidenceUrl: state.evidenceUrl,
    };
    socket.emit('security-report', { room: state.roomCode, report: state.report });
  } else {
    setNodeState('risk', score > 0, false);
    setNodeState('report', false, false);
    if (!state.analysisEnabled) {
      els.reportStatus.textContent = 'Security Analysis Disabled';
      els.reportSummary.textContent = 'No incident recorded';
    }
  }

  if (score > 60) {
    socket.emit('security-alert', {
      room: state.roomCode,
      riskScore: score,
      reason: state.geminiReason,
      transcript: state.transcript,
      report: state.report,
    });
  }

  if (state.callState === 'active' && score > 60) {
    els.pipelineState.textContent = 'Alert';
    els.pipelineState.classList.add('alert');
  } else if (state.callState === 'active' && state.analysisEnabled) {
    els.pipelineState.textContent = 'Monitoring';
  }

  state.riskHistory.push({ ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), score: Math.round(score) });
  if (state.riskHistory.length > 12) state.riskHistory.shift();
}

async function sendGeminiCheck() {
  if (!state.analysisEnabled || state.callState !== 'active') return;
  const transcriptText = state.transcript.map((item) => `${item.speaker}: ${item.text}`).join(' ');
  if (!transcriptText.trim()) return;

  const now = Date.now();
  if (now - state.lastGeminiAt < 4000) return;
  state.lastGeminiAt = now;

  try {
    const response = await fetch('/api/gemini-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: transcriptText }),
    });
    const data = await response.json();
    const confidence = Number(data.confidence || 0);
    const reason = String(data.reason || 'No reason returned');
    state.geminiConfidence = confidence;
    state.geminiReason = reason;
    state.geminiHistory.push({
      ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      confidence: Math.round(confidence),
      is_scam: Boolean(data.is_scam),
      reason,
    });

    els.geminiScoreDisplay.textContent = `${Math.round(confidence)}%`;
    els.geminiReasonDisplay.textContent = reason.slice(0, 80);
    els.localScoreDisplay.textContent = `${Math.round(state.localConfidence)}%`;
    setNodeState('analysis', true, false);
    refreshRiskDisplay();
  } catch (error) {
    elss = els;
    els.geminiReasonDisplay.textContent = 'Gemini unavailable';
    state.geminiConfidence = state.localConfidence;
    refreshRiskDisplay();
  }
}

function startSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition || !state.analysisEnabled || state.callState !== 'active') return;

  if (state.recognition) {
    try { state.recognition.stop(); } catch (error) {}
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let finalTranscript = '';
    let interimTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = result[0].transcript.trim();
      if (result.isFinal) {
        finalTranscript += `${text} `;
      } else {
        interimTranscript += `${text} `;
      }
    }

    if (finalTranscript) {
      addTranscriptLine('Caller', finalTranscript.trim());
      state.transcript = state.transcript.slice(-12);
      els.sttSummary.textContent = finalTranscript.trim();
      setNodeState('speech', true, false);
      updateLocalAnalysis();
      refreshRiskDisplay();
    }

    if (interimTranscript) {
      els.sttSummary.textContent = interimTranscript.trim();
    }
  };

  recognition.onend = () => {
    if (state.analysisEnabled && state.callState === 'active') {
      try { recognition.start(); } catch (error) {}
    }
  };

  recognition.start();
  state.recognition = recognition;
}

function stopSpeechRecognition() {
  if (state.recognition) {
    try { state.recognition.stop(); } catch (error) {}
    state.recognition = null;
  }
}

async function getMedia() {
  if (state.localStream) return state.localStream;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.localStream = stream;
    if (state.callState === 'active') {
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const updateMeter = () => {
        if (state.callState !== 'active') return;
        analyser.getByteFrequencyData(data);
        const average = data.reduce((sum, value) => sum + value, 0) / data.length;
        const bars = Array.from(document.querySelectorAll('.meter-bar'));
        bars.forEach((bar, index) => {
          const level = Math.max(16, (average / 255) * 100 + index * 8);
          bar.style.height = `${Math.min(level, 100)}%`;
        });
        requestAnimationFrame(updateMeter);
      };
      updateMeter();
    }
    return stream;
  } catch (error) {
    console.error('Microphone permission failed:', error);
    return null;
  }
}

function createPeerConnection() {
  if (state.peerConnection) return state.peerConnection;

  const peerConnection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  state.peerConnection = peerConnection;

  peerConnection.ontrack = (event) => {
    const stream = event.streams[0];
    state.remoteStream = stream;
    const remoteAudio = document.getElementById('remoteAudio');
    if (remoteAudio) remoteAudio.srcObject = stream;
    remoteAudio?.play();
    setNodeState('capture', true, false);
    els.captureSummary.textContent = 'Audio stream connected';
  };

  peerConnection.onconnectionstatechange = () => {
    if (peerConnection.connectionState === 'connected') {
      els.captureSummary.textContent = 'Live call active';
      setNodeState('capture', true, false);
      startCallTimer();
      startSpeechRecognition();
      if (state.analysisEnabled) {
        updateLocalAnalysis();
      }
    }
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && state.activePeerId) {
      socket.emit('webrtc-signal', { to: state.activePeerId, signal: event.candidate });
    }
  };

  return peerConnection;
}

async function attachLocalMedia() {
  const stream = await getMedia();
  if (!stream) return;
  const peerConnection = createPeerConnection();
  stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));
  return peerConnection;
}

function resetPeerConnection() {
  if (state.peerConnection) {
    state.peerConnection.close();
    state.peerConnection = null;
  }
  if (state.localStream) {
    state.localStream.getTracks().forEach((track) => track.stop());
    state.localStream = null;
  }
  stopSpeechRecognition();
  stopCallTimer();
  hideAlertOverlay();
}

async function dialPeer() {
  const otherPeers = state.roomPeers.filter((peerId) => peerId !== state.localPeerId);
  if (!otherPeers.length) {
    alert('No peer is in this room yet. Ask the other laptop to join the same room code.');
    return;
  }

  state.activePeerId = otherPeers[0];
  state.callState = 'active';
  updateCallUi();
  await attachLocalMedia();

  const peerConnection = createPeerConnection();
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit('webrtc-signal', { to: state.activePeerId, signal: offer });
  setNodeState('capture', true, false);
  setNodeState('speech', true, false);
  els.captureSummary.textContent = 'Dialing peer';
  updateWaveform();
}

function setCallOutgoingState() {
  state.callState = 'active';
  updateCallUi();
  setNodeState('capture', true, false);
  setNodeState('speech', true, false);
  els.captureSummary.textContent = 'Connection live';
}

function handleAnswer(signal) {
  if (state.peerConnection && signal) {
    state.peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
  }
}

function handleOffer(signal) {
  if (!state.peerConnection) {
    attachLocalMedia();
  }
  const peerConnection = createPeerConnection();
  peerConnection.setRemoteDescription(new RTCSessionDescription(signal))
    .then(() => peerConnection.createAnswer())
    .then((answer) => peerConnection.setLocalDescription(answer))
    .then(() => {
      socket.emit('webrtc-signal', { to: state.activePeerId, signal: peerConnection.localDescription });
    });
}

function handleIceCandidate(candidate) {
  try {
    if (state.peerConnection && candidate) {
      state.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  } catch (error) {
    console.warn('ICE candidate failed to add:', error);
  }
}

function endCall() {
  if (state.peerConnection) {
    state.peerConnection.close();
    state.peerConnection = null;
  }
  stopSpeechRecognition();
  stopCallTimer();
  state.callState = 'idle';
  state.activePeerId = null;
  state.transcript = [];
  state.keywordHits = [];
  state.geminiHistory = [];
  state.riskHistory = [];
  state.currentRisk = 0;
  state.localConfidence = 0;
  state.geminiConfidence = 0;
  state.geminiReason = 'Waiting for first verdict...';
  els.localScoreDisplay.textContent = '0%';
  els.geminiScoreDisplay.textContent = '0%';
  els.geminiReasonDisplay.textContent = 'Waiting...';
  els.riskScoreDisplay.textContent = '0%';
  els.riskMeterFill.style.width = '0%';
  els.sttSummary.textContent = 'Waiting for audio';
  els.captureSummary.textContent = 'Awaiting capture';
  els.reportStatus.textContent = 'Idle';
  els.reportSummary.textContent = 'No incident recorded';
  hideAlertOverlay();
  updateCallUi();
  updateToggleUi();
}

function bindUiEvents() {
  els.joinRoomBtn.addEventListener('click', () => {
    setRoomCode(els.roomInput.value);
    socket.emit('join-room', state.roomCode);
  });

  els.analysisToggle.addEventListener('click', () => {
    setAnalysisEnabled(!state.analysisEnabled);
  });

  els.dialBtn.addEventListener('click', async () => {
    await dialPeer();
  });

  els.acceptCallBtn.addEventListener('click', async () => {
    if (!state.activePeerId) return;
    state.callState = 'active';
    await attachLocalMedia();
    socket.emit('call-accept', { room: state.roomCode, to: state.activePeerId });
    updateCallUi();
    if (state.analysisEnabled) {
      startSpeechRecognition();
      updateLocalAnalysis();
    }
  });

  els.declineCallBtn.addEventListener('click', () => {
    if (state.activePeerId) {
      socket.emit('call-decline', { room: state.roomCode, to: state.activePeerId });
    }
    state.callState = 'idle';
    state.activePeerId = null;
    updateCallUi();
  });

  els.endCallBtn.addEventListener('click', () => {
    socket.emit('call-decline', { room: state.roomCode, to: state.activePeerId });
    endCall();
  });

  els.muteBtn.addEventListener('click', () => {
    state.muted = !state.muted;
    if (state.localStream) {
      state.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !state.muted;
      });
    }
    els.muteBtn.classList.toggle('active', state.muted);
    els.muteBtn.textContent = state.muted ? 'Unmute' : 'Mute';
  });

  els.speakerBtn.addEventListener('click', () => {
    state.speakerOn = !state.speakerOn;
    els.speakerBtn.classList.toggle('active', state.speakerOn);
    els.speakerBtn.textContent = state.speakerOn ? 'Speaker' : 'Phone';
  });

  els.closeDetailBtn.addEventListener('click', closeDetail);
  els.detailModal.addEventListener('click', (event) => {
    if (event.target.dataset.close === 'true') closeDetail();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDetail();
  });
}

function bindSocketEvents() {
  socket.on('connect', () => {
    socket.emit('join-room', state.roomCode);
  });

  socket.on('room-joined', ({ room, socketId }) => {
    state.localPeerId = socketId;
    state.roomCode = room;
    els.roomInput.value = room;
    state.roomPeers = Array.from(new Set([...state.roomPeers, socketId]));
  });

  socket.on('room-state', ({ room, peers }) => {
    state.roomPeers = peers || [];
    els.callNumber.textContent = state.roomPeers.length > 1 ? 'Room online' : 'Waiting for peer';
  });

  socket.on('incoming-call', ({ callerId, room }) => {
    state.activePeerId = callerId;
    state.callState = 'incoming';
    updateCallUi();
    els.incomingPeerLabel.textContent = `Peer ${callerId.slice(0, 8)}`;
    setNodeState('capture', true, false);
  });

  socket.on('call-accepted', ({ responderId, room }) => {
    setCallOutgoingState();
    setNodeState('capture', true, false);
  });

  socket.on('call-declined', () => {
    state.callState = 'idle';
    state.activePeerId = null;
    updateCallUi();
    endCall();
  });

  socket.on('webrtc-signal', ({ from, signal }) => {
    if (!from || !signal) return;
    if (from !== state.activePeerId && from !== state.localPeerId) return;
    if (!signal.type && signal.candidate) {
      handleIceCandidate(signal.candidate || signal);
      return;
    }

    if (signal.type === 'offer') {
      state.activePeerId = from;
      handleOffer(signal);
    } else if (signal.type === 'answer') {
      handleAnswer(signal);
    } else if (signal.candidate) {
      handleIceCandidate(signal.candidate);
    }
  });

  socket.on('security-alert', ({ from, riskScore, reason, transcript, report }) => {
    if (from === state.localPeerId) return;
    if (!state.analysisEnabled) return;
    state.geminiReason = reason || 'Peer alert from room';
    state.currentRisk = riskScore;
    if (riskScore > 60) {
      showAlertOverlay();
      els.reportStatus.textContent = 'Peer alert received';
      els.reportSummary.textContent = 'Threat shared over network';
      setNodeState('risk', true, true);
      setNodeState('report', true, true);
    }
  });

  socket.on('security-report', ({ from, report }) => {
    if (from === state.localPeerId) return;
    if (report) state.report = report;
  });
}

function initialPipelineState() {
  setRoomCode(els.roomInput.value);
  els.analysisToggle.classList.add('on');
  updateToggleUi();
  updateCallUi();
  bindUiEvents();
  bindSocketEvents();
  registerNodeDetails();
  setInterval(updateWaveform, 450);
  setInterval(() => {
    if (state.analysisEnabled && state.callState === 'active') {
      updateLocalAnalysis();
      refreshRiskDisplay();
    }
  }, 6000);
}

initialPipelineState();
