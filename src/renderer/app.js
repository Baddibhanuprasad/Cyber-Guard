const state = {
  pipelineActive: true,
  inCall: false,
  callStartTime: null,
  timerInterval: null,
  currentRiskScore: 0,
  transcript: [],
  localMLScore: 0,
  geminiScore: 0,
  geminiReason: 'Awaiting text stream...',
  assignedPhone: '+1 (555) 019-2834',
  roomCode: '4A-7Z-9K',
  activeKeyIndex: 0,
  geminiKeys: [
    { id: 1, key: '', label: 'Primary Key #1', status: 'Active' },
    { id: 2, key: '', label: 'Backup Key #2', status: 'Idle' },
    { id: 3, key: '', label: 'Failover Key #3', status: 'Idle' },
    { id: 4, key: '', label: 'Backup Key #4', status: 'Idle' }
  ]
};

const SCAM_KEYWORDS = ['bank', 'security', 'verify', 'account', 'otp', 'code', 'urgent', 'transfer', 'kyc', 'police', 'blocked'];

window.addEventListener('load', () => {
  initAudioWaveformCanvas();
  updateClock();
  setInterval(updateClock, 1000);
  renderGeminiKeys();
  bindTabDefaults();
});

function bindTabDefaults() {
  const calls = document.getElementById('tabContentCalls');
  const profile = document.getElementById('tabContentProfile');
  const whatsapp = document.getElementById('tabContentWhatsapp');

  if (calls) calls.classList.remove('hidden');
  if (profile) profile.classList.add('hidden');
  if (whatsapp) whatsapp.classList.add('hidden');
}

function updateClock() {
  const now = new Date();
  const hrs = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  const phoneClock = document.getElementById('phoneClock');
  if (phoneClock) phoneClock.innerText = `${hrs}:${mins}`;
}

function copyRoomCode() {
  navigator.clipboard.writeText(state.roomCode);
  alert('Room Code copied: ' + state.roomCode);
}

function switchPhoneTab(tabName) {
  const panelCalls = document.getElementById('tabContentCalls');
  const panelProfile = document.getElementById('tabContentProfile');
  const panelWhatsapp = document.getElementById('tabContentWhatsapp');

  if (panelCalls) panelCalls.classList.add('hidden');
  if (panelProfile) panelProfile.classList.add('hidden');
  if (panelWhatsapp) panelWhatsapp.classList.add('hidden');

  const btnCalls = document.getElementById('navBtnCalls');
  const btnProfile = document.getElementById('navBtnProfile');
  const btnWhatsapp = document.getElementById('navBtnWhatsapp');

  if (btnCalls) btnCalls.className = 'py-2 flex flex-col items-center text-slate-500 hover:text-slate-300';
  if (btnProfile) btnProfile.className = 'py-2 flex flex-col items-center text-slate-500 hover:text-slate-300';
  if (btnWhatsapp) btnWhatsapp.className = 'py-2 flex flex-col items-center text-slate-500 hover:text-slate-300';

  if (tabName === 'calls') {
    if (panelCalls) panelCalls.classList.remove('hidden');
    if (btnCalls) btnCalls.className = 'py-2 flex flex-col items-center text-cyan-400 font-bold';
  } else if (tabName === 'profile') {
    if (panelProfile) panelProfile.classList.remove('hidden');
    if (btnProfile) btnProfile.className = 'py-2 flex flex-col items-center text-cyan-400 font-bold';
  } else if (tabName === 'whatsapp') {
    if (panelWhatsapp) panelWhatsapp.classList.remove('hidden');
    if (btnWhatsapp) btnWhatsapp.className = 'py-2 flex flex-col items-center text-emerald-400 font-bold';
  }
}

function appendDigit(digit) {
  const input = document.getElementById('dialerInput');
  if (input) input.value += digit;
}

function clearDialer() {
  const input = document.getElementById('dialerInput');
  if (input) input.value = input.value.slice(0, -1);
}

function executeDial() {
  const input = document.getElementById('dialerInput');
  if (!input) return;
  const num = input.value.trim();
  if (!num) return;
  const activeCallerNum = document.getElementById('activeCallerNum');
  if (activeCallerNum) activeCallerNum.innerText = num;
  startSimulatedCall();
}

function updateProfilePhone() {
  const phoneInput = document.getElementById('profilePhoneInput');
  if (!phoneInput) return;
  state.assignedPhone = phoneInput.value;
  const headerAssignedPhone = document.getElementById('headerAssignedPhone');
  if (headerAssignedPhone) headerAssignedPhone.innerText = state.assignedPhone;
}

function renderGeminiKeys() {
  const container = document.getElementById('geminiKeysContainer');
  if (!container) return;

  container.innerHTML = '';
  state.geminiKeys.forEach((keyObj, idx) => {
    const isActive = idx === state.activeKeyIndex;
    const item = document.createElement('div');
    item.className = `p-1.5 bg-slate-900 rounded border ${isActive ? 'border-amber-500' : 'border-slate-800'} text-[10px] font-mono space-y-1`;
    item.innerHTML = `
      <div class="flex justify-between items-center">
        <span class="text-slate-300 font-bold">${keyObj.label}</span>
        <span class="${isActive ? 'text-amber-400 font-bold' : 'text-slate-500'}">${isActive ? 'ACTIVE' : keyObj.status}</span>
      </div>
      <input type="password" placeholder="AIzaSy..." value="${keyObj.key}" onchange="updateGeminiKeyValue(${idx}, this.value)" class="w-full bg-black/60 border border-slate-800 rounded p-1 text-[10px] font-mono text-amber-300 focus:outline-none">
    `;
    container.appendChild(item);
  });

  const activeKeyDisplayTag = document.getElementById('activeKeyDisplayTag');
  if (activeKeyDisplayTag) activeKeyDisplayTag.innerText = `KEY #${state.activeKeyIndex + 1}`;
}

function updateGeminiKeyValue(index, value) {
  state.geminiKeys[index].key = value;
}

function addNewGeminiKey() {
  const newId = state.geminiKeys.length + 1;
  state.geminiKeys.push({ id: newId, key: '', label: `Backup Key #${newId}`, status: 'Idle' });
  renderGeminiKeys();
}

function rotateGeminiKey() {
  state.activeKeyIndex = (state.activeKeyIndex + 1) % state.geminiKeys.length;
  renderGeminiKeys();
}

function startWhatsappCallBridge() {
  switchPhoneTab('calls');
  const name = document.getElementById('activeCallerName');
  if (name) name.innerText = 'WhatsApp Contact';
  startSimulatedCall();
}

function startSimulatedCall() {
  state.inCall = true;
  state.callStartTime = Date.now();

  const callStateBadge = document.getElementById('callStateBadge');
  if (callStateBadge) {
    callStateBadge.innerText = 'IN-CALL';
    callStateBadge.className = 'px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 animate-pulse';
  }

  const idleDialerScreen = document.getElementById('idleDialerScreen');
  const activeInCallScreen = document.getElementById('activeInCallScreen');
  if (idleDialerScreen) idleDialerScreen.classList.add('hidden');
  if (activeInCallScreen) activeInCallScreen.classList.remove('hidden');

  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = setInterval(updateCallTimer, 1000);
  appendTranscript('System', 'WebRTC / WhatsApp Audio session established.');
}

function terminateCall() {
  state.inCall = false;
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }

  const callStateBadge = document.getElementById('callStateBadge');
  if (callStateBadge) {
    callStateBadge.innerText = 'READY';
    callStateBadge.className = 'px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800';
  }

  const idleDialerScreen = document.getElementById('idleDialerScreen');
  const activeInCallScreen = document.getElementById('activeInCallScreen');
  if (idleDialerScreen) idleDialerScreen.classList.remove('hidden');
  if (activeInCallScreen) activeInCallScreen.classList.add('hidden');

  const scamOverlayBanner = document.getElementById('scamOverlayBanner');
  if (scamOverlayBanner) scamOverlayBanner.classList.add('hidden');
  const phoneDeviceFrame = document.getElementById('phoneDeviceFrame');
  if (phoneDeviceFrame) phoneDeviceFrame.classList.remove('shake-alert');
}

function updateCallTimer() {
  if (!state.callStartTime) return;
  const elapsedSeconds = Math.floor((Date.now() - state.callStartTime) / 1000);
  const mins = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
  const secs = String(elapsedSeconds % 60).padStart(2, '0');
  const callTimer = document.getElementById('callTimer');
  if (callTimer) callTimer.innerText = `${mins}:${secs}`;
}

function toggleMute() {
  const btn = document.getElementById('muteBtn');
  if (btn) {
    btn.classList.toggle('bg-red-900');
    btn.classList.toggle('text-red-300');
  }
}

function togglePipeline() {
  const toggle = document.getElementById('pipelineToggle');
  const isChecked = toggle ? toggle.checked : true;
  state.pipelineActive = isChecked;

  const pipelineContainer = document.getElementById('pipelineContainer');
  const stateText = document.getElementById('pipelineStateText');

  if (isChecked) {
    if (pipelineContainer) pipelineContainer.classList.remove('opacity-30', 'pointer-events-none');
    if (stateText) {
      stateText.innerText = 'PIPELINE ACTIVE';
      stateText.className = 'text-cyan-400 font-semibold';
    }
  } else {
    if (pipelineContainer) pipelineContainer.classList.add('opacity-30', 'pointer-events-none');
    if (stateText) {
      stateText.innerText = 'SECURITY PIPELINE DISABLED';
      stateText.className = 'text-slate-500 font-semibold';
    }
    const scamOverlayBanner = document.getElementById('scamOverlayBanner');
    if (scamOverlayBanner) scamOverlayBanner.classList.add('hidden');
    const phoneDeviceFrame = document.getElementById('phoneDeviceFrame');
    if (phoneDeviceFrame) phoneDeviceFrame.classList.remove('shake-alert');
  }
}

function initAudioWaveformCanvas() {
  const canvas = document.getElementById('waveformCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function draw() {
    if (!canvas.parentElement) return;
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = state.inCall ? '#00f2fe' : '#334155';

    ctx.beginPath();
    const sliceWidth = canvas.width / 30;
    let x = 0;

    for (let i = 0; i < 30; i++) {
      const v = state.inCall ? Math.random() * 0.8 + 0.1 : 0.1;
      const y = (v * canvas.height) / 2 + canvas.height / 4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.stroke();
  }

  setInterval(draw, 120);
}

function appendTranscript(speaker, text) {
  state.transcript.push({ speaker, text, timestamp: new Date().toLocaleTimeString() });
  const miniBox = document.getElementById('miniTranscriptBox');
  if (!miniBox) return;

  const line = document.createElement('p');
  line.className = 'text-slate-300 border-b border-slate-900/60 pb-0.5';
  line.innerHTML = `<span class="text-cyan-400 font-bold">${speaker}:</span> ${text}`;
  miniBox.appendChild(line);
  miniBox.scrollTop = miniBox.scrollHeight;

  if (state.pipelineActive && speaker !== 'System') {
    runDualAnalysis(text);
  }
}

function simulateNormalTranscript() {
  if (!state.inCall) startSimulatedCall();
  appendTranscript('Caller', 'Hi, I\'m calling to discuss our weekend family gathering.');
}

function simulateScamTranscript() {
  if (!state.inCall) startSimulatedCall();

  const phrases = [
    'This is bank security department calling regarding suspicious transaction.',
    'Verify your account now by reading your 6-digit OTP code immediately.',
    'Urgent KYC update required or your bank account will be blocked today.'
  ];

  let index = 0;
  const interval = setInterval(() => {
    if (index < phrases.length && state.inCall) {
      appendTranscript('Caller', phrases[index]);
      index += 1;
    } else {
      clearInterval(interval);
    }
  }, 2000);
}

async function runDualAnalysis(latestText) {
  let hits = 0;
  const lower = latestText.toLowerCase();
  SCAM_KEYWORDS.forEach((kw) => {
    if (lower.includes(kw)) hits += 1;
  });

  state.localMLScore = Math.min(hits * 35, 95);
  const localScoreEl = document.getElementById('node3LocalScore');
  if (localScoreEl) localScoreEl.innerText = `${state.localMLScore}%`;

  rotateGeminiKey();
  const currentKeyObj = state.geminiKeys[state.activeKeyIndex];
  const apiKey = currentKeyObj ? currentKeyObj.key || '' : '';

  if (apiKey) {
    try {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
      const payload = {
        contents: [{ parts: [{ text: `Analyze transcript for scam: "${latestText}". Respond JSON: {"is_scam": boolean, "confidence": number, "reason": "string"}` }] }]
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        const textData = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textData) {
          const parsed = JSON.parse(textData);
          state.geminiScore = parsed.confidence || 0;
          state.geminiReason = parsed.reason || 'Analyzed by Gemini.';
        }
      } else {
        state.geminiScore = state.localMLScore > 50 ? 90 : 15;
        state.geminiReason = state.localMLScore > 50 ? 'Urgent OTP phrase pattern detected.' : 'Normal speech.';
      }
    } catch (err) {
      state.geminiScore = state.localMLScore > 50 ? 90 : 15;
      state.geminiReason = state.localMLScore > 50 ? 'Urgent OTP phrase pattern detected.' : 'Normal speech.';
    }
  } else {
    state.geminiScore = state.localMLScore > 50 ? 90 : 15;
    state.geminiReason = state.localMLScore > 50 ? 'Urgent OTP phrase pattern detected.' : 'Normal speech.';
  }

  const geminiScoreEl = document.getElementById('node3GeminiScore');
  if (geminiScoreEl) geminiScoreEl.innerText = `${state.geminiScore}%`;
  calculateAggregatedRisk();
}

function calculateAggregatedRisk() {
  state.currentRiskScore = Math.min(Math.max(state.localMLScore, state.geminiScore), 100);

  const meterVal = document.getElementById('mainRiskMeterVal');
  const progressBar = document.getElementById('mainRiskProgressBar');
  const statusMsg = document.getElementById('riskStatusMsg');
  const paths = document.querySelectorAll('#conduitSvg path');
  const scamOverlayBanner = document.getElementById('scamOverlayBanner');
  const overlayConfidenceVal = document.getElementById('overlayConfidenceVal');
  const overlayReasonText = document.getElementById('overlayReasonText');
  const phoneDeviceFrame = document.getElementById('phoneDeviceFrame');
  const reportStateBadge = document.getElementById('reportStateBadge');
  const reportReasonText = document.getElementById('reportReasonText');
  const reportLogCount = document.getElementById('reportLogCount');

  if (meterVal) meterVal.innerText = `${state.currentRiskScore}%`;
  if (progressBar) progressBar.style.width = `${state.currentRiskScore}%`;

  if (state.currentRiskScore > 60) {
    if (meterVal) meterVal.className = 'text-xl font-bold mono-text text-red-500 animate-pulse';
    if (progressBar) progressBar.className = 'bg-red-500 h-full transition-all duration-500';
    if (statusMsg) {
      statusMsg.innerText = 'STATUS: CRITICAL SCAM THREAT DETECTED!';
      statusMsg.className = 'text-[10px] text-red-400 font-bold';
    }

    paths.forEach((p) => {
      p.classList.remove('path-active');
      p.classList.add('path-alert');
    });

    if (state.pipelineActive && state.inCall) {
      if (scamOverlayBanner) scamOverlayBanner.classList.remove('hidden');
      if (overlayConfidenceVal) overlayConfidenceVal.innerText = `${state.currentRiskScore}%`;
      if (overlayReasonText) overlayReasonText.innerText = state.geminiReason;
      if (phoneDeviceFrame) phoneDeviceFrame.classList.add('shake-alert');
    }

    if (reportStateBadge) {
      reportStateBadge.innerText = 'CRITICAL ALERT';
      reportStateBadge.className = 'text-[10px] font-mono text-red-400 bg-red-950 px-1.5 py-0.5 rounded border border-red-800 animate-pulse';
    }
    if (reportReasonText) reportReasonText.innerText = `Evidence Captured: ${state.geminiReason}`;
    if (reportLogCount) reportLogCount.innerText = `${state.transcript.length} Events Captured`;
  } else {
    if (meterVal) meterVal.className = 'text-xl font-bold mono-text text-emerald-400';
    if (progressBar) progressBar.className = 'bg-emerald-400 h-full transition-all duration-500';
    if (statusMsg) {
      statusMsg.innerText = 'Status: Monitoring Low Risk';
      statusMsg.className = 'text-[10px] text-slate-400';
    }

    paths.forEach((p) => {
      p.classList.remove('path-alert');
      p.classList.add('path-active');
    });

    if (scamOverlayBanner) scamOverlayBanner.classList.add('hidden');
    if (phoneDeviceFrame) phoneDeviceFrame.classList.remove('shake-alert');
  }
}

function inspectRawPacket() {
  openNodeDetail('conduit');
}

function openNodeDetail(nodeId) {
  const modal = document.getElementById('detailModal');
  const title = document.getElementById('modalTitle');
  const subTitle = document.getElementById('modalSubTitle');
  const body = document.getElementById('modalBody');

  if (!modal || !title || !subTitle || !body) return;
  modal.classList.remove('hidden');

  if (nodeId === 'conduit') {
    title.innerText = 'DATA CONDUIT PACKET PAYLOAD';
    subTitle.innerText = 'Raw Inter-node Payload Log';
    body.innerHTML = `
      <div class="bg-black/90 p-4 rounded-xl border border-cyan-800 font-mono text-cyan-400 text-xs">
        <pre>${JSON.stringify({
          timestamp: new Date().toISOString(),
          active_key: state.geminiKeys[state.activeKeyIndex].label,
          assigned_phone: state.assignedPhone,
          current_risk_score: state.currentRiskScore,
          latest_transcript: state.transcript[state.transcript.length - 1] || 'N/A'
        }, null, 2)}</pre>
      </div>
    `;
  } else if (nodeId === 'node1') {
    title.innerText = 'BLOCK 1: CALL CAPTURE ENGINE';
    subTitle.innerText = 'Audio Ingestion';
    body.innerHTML = `<div class="p-4 bg-slate-900 rounded-xl">Assigned Device Phone: ${state.assignedPhone}</div>`;
  } else if (nodeId === 'node2') {
    title.innerText = 'BLOCK 2: SPEECH-TO-TEXT';
    subTitle.innerText = 'Transcriptions';
    body.innerHTML = state.transcript.map((t) => `<div class="p-2 bg-slate-900 rounded mb-1">${t.speaker}: ${t.text}</div>`).join('');
  } else if (nodeId === 'node3') {
    title.innerText = 'BLOCK 3: DUAL ANALYSIS & MULTI-KEY POOL';
    subTitle.innerText = 'Gemini Keys Pool State';
    body.innerHTML = state.geminiKeys.map((k) => `<div class="p-2 bg-slate-900 rounded mb-1 flex justify-between"><span>${k.label}</span><span>${k.status}</span></div>`).join('');
  } else if (nodeId === 'node4') {
    title.innerText = 'BLOCK 4: RISK SCORING';
    subTitle.innerText = 'Threshold Metric';
    body.innerHTML = `<div class="p-4 bg-slate-900 rounded-xl text-center text-xl text-cyan-400 font-bold">Aggregated Score: ${state.currentRiskScore}%</div>`;
  } else if (nodeId === 'node5') {
    title.innerText = 'BLOCK 5: INCIDENT EVIDENCE';
    subTitle.innerText = 'Captured Forensic Log';
    body.innerHTML = `<div class="p-4 bg-slate-900 rounded-xl">Total Events: ${state.transcript.length}</div>`;
  }
}

function closeDetailModal() {
  const modal = document.getElementById('detailModal');
  if (modal) modal.classList.add('hidden');
}
