// KODAMI CHAT — Sensei (izquierda) + Nova (derecha) con voz
let chatOpen = false;
let activeAgent = 'sensei';
let isSending = false;
let chatHistorySensei = [];
let chatHistoryNova = [];
let voiceEnabled = false;

function openChat(agent) {
  if (chatOpen && activeAgent === agent) { closeChat(); return; }
  activeAgent = agent;
  chatOpen = true;
  const senseiPanel = document.getElementById('chatSensei');
  const novaPanel = document.getElementById('chatNova');
  if (agent === 'sensei') {
    if (senseiPanel) senseiPanel.classList.add('open');
    if (novaPanel) novaPanel.classList.remove('open');
    setCursorTheme('sensei');
    if (window.senseiCtrl?.enterChat) window.senseiCtrl.enterChat();
    if (window.novaCtrl?.exitChat) window.novaCtrl.exitChat();
  } else {
    if (novaPanel) novaPanel.classList.add('open');
    if (senseiPanel) senseiPanel.classList.remove('open');
    setCursorTheme('nova');
    if (window.novaCtrl?.enterChat) window.novaCtrl.enterChat();
    if (window.senseiCtrl?.exitChat) window.senseiCtrl.exitChat();
  }
  // Mobile: scroll to chat
  if (isMobile) setTimeout(() => {
    const el = document.getElementById(`chat${agent==='sensei'?'Sensei':'Nova'}`);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, 100);
  setTimeout(() => {
    const input = document.getElementById(`chatInput${agent==='sensei'?'Sensei':'Nova'}`);
    if (input) input.focus();
  }, 300);
}

function closeChat() {
  chatOpen = false;
  const senseiPanel = document.getElementById('chatSensei');
  const novaPanel = document.getElementById('chatNova');
  if (senseiPanel) senseiPanel.classList.remove('open');
  if (novaPanel) novaPanel.classList.remove('open');
  setCursorTheme('sensei');
  if (window.senseiCtrl?.exitChat) window.senseiCtrl.exitChat();
  if (window.novaCtrl?.exitChat) window.novaCtrl.exitChat();
}

function clearChat(agent) {
  if (!confirm('¿Limpiar historial?')) return;
  const a = agent || activeAgent;
  if (a === 'sensei') chatHistorySensei = [];
  else chatHistoryNova = [];
  const el = document.getElementById(`chatMessages${a==='sensei'?'Sensei':'Nova'}`);
  if (el) el.innerHTML = a === 'sensei'
    ? '<div class="msg msg-ai">¡Chat limpio! 🦝⚔️ ¿En qué puedo ayudarte, guerrero?</div>'
    : '<div class="msg msg-ai">¡Chat limpio! 💙🚀 ¿Qué buscamos hoy, explorador?</div>';
}

function escapeHtml(t) {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

function renderLinks(texto) {
  return texto.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener" class="chat-link">$1</a>'
  );
}

function renderMarkdown(text) {
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="chat-link">$1</a>');
  text = text.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" class="chat-link">$1</a>');
  text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  let lines = text.split('\n');
  let result = [], inUl = false;
  for (let line of lines) {
    let bullet = line.match(/^\- (.+)/);
    if (bullet) {
      if (!inUl) { result.push('<ul>'); inUl = true; }
      result.push('<li>' + bullet[1] + '</li>');
    } else {
      if (inUl) { result.push('</ul>'); inUl = false; }
      if (line.trim() && !line.match(/^<\/?h[23]>/)) result.push('<p>' + line + '</p>');
      else if (line.trim()) result.push(line);
    }
  }
  if (inUl) result.push('</ul>');
  return result.join('\n');
}

function addMsg(agent, text, isAi, isError = false) {
  const msgs = document.getElementById(`chatMessages${agent==='sensei'?'Sensei':'Nova'}`);
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = 'msg' + (isAi ? ' msg-ai' : ' msg-user') + (isError ? ' msg-error' : '');
  if (isAi && !isError) {
    const badge = agent === 'nova'
      ? '<span style="font-size:.5rem;letter-spacing:1px;text-transform:uppercase;color:var(--blue);opacity:.7;display:block;margin-bottom:3px;">💙 Nova</span>'
      : '<span style="font-size:.5rem;letter-spacing:1px;text-transform:uppercase;color:var(--craft);opacity:.7;display:block;margin-bottom:3px;">⚔ Sensei</span>';
    div.innerHTML = badge + (isAi ? renderMarkdown(text) : text);
  } else {
    div.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
  }
  msgs.appendChild(div);
  setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 50);

  // TTS
  if (isAi && !isError && voiceEnabled) {
    const utterance = new SpeechSynthesisUtterance(text.replace(/<[^>]*>/g, ''));
    utterance.lang = 'es-MX';
    utterance.rate = 0.9;
    speechSynthesis.speak(utterance);
  }
}

async function sendMsg(agent) {
  agent = agent || activeAgent;
  if (isSending) return;
  const inputId = `chatInput${agent==='sensei'?'Sensei':'Nova'}`;
  const input = document.getElementById(inputId);
  if (!input) return;
  const msg = input.value.trim();
  if (!msg) return;

  const history = agent === 'sensei' ? chatHistorySensei : chatHistoryNova;

  isSending = true;
  input.value = '';
  input.disabled = true;

  addMsg(agent, msg, false);
  history.push({ role: 'user', content: msg });

  const tid = 't' + Date.now();
  const msgs = document.getElementById(`chatMessages${agent==='sensei'?'Sensei':'Nova'}`);
  if (msgs) {
    const typing = document.createElement('div');
    typing.className = 'msg msg-ai msg-typing';
    typing.id = tid;
    typing.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
    msgs.appendChild(typing);
    msgs.scrollTop = msgs.scrollHeight;
  }

  try {
    const endpoint = agent === 'sensei' ? '/api/chat/sensei' : '/api/chat/nova';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(`${API}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, history: history.slice(-10) }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content;
    if (!reply) throw new Error('Respuesta vacía');

    const typingEl = document.getElementById(tid);
    if (typingEl) typingEl.remove();

    history.push({ role: 'assistant', content: reply });
    addMsg(agent, reply, true);
  } catch (e) {
    const typingEl = document.getElementById(tid);
    if (typingEl) typingEl.remove();
    if (history.length && history[history.length-1]?.role === 'user') history.pop();
    let em = '⚠️ ';
    if (e.name === 'AbortError') em += 'Tiempo agotado. Intenta de nuevo.';
    else if (e.message.includes('fetch')) em += 'Error de conexión con el servidor.';
    else em += escapeHtml(e.message);
    addMsg(agent, em, true, true);
  } finally {
    isSending = false;
    input.disabled = false;
    if (!isMobile) input.focus();
  }
}

// Voice Recognition — estilo WhatsApp (presiona + suelta)
let recognition = null;
let pressingMic = false;
let speechTranscript = '';

function checkSpeechAPI() {
  return ('webkitSpeechRecognition' in window) || ('SpeechRecognition' in window);
}

function setupMicButtons() {
  document.querySelectorAll('.chat-action-icon').forEach(btn => {
    btn.addEventListener('mousedown', startPTT);
    btn.addEventListener('touchstart', startPTT, { passive: true });
  });
  document.addEventListener('mouseup', stopPTT);
  document.addEventListener('touchend', stopPTT);
}

function getActiveMicBtn() {
  return document.querySelector(`#chat${activeAgent==='sensei'?'Sensei':'Nova'} .chat-action-icon`);
}

function cleanMicState() {
  recognition = null;
  pressingMic = false;
  const b = getActiveMicBtn();
  if (b) b.classList.remove('recording');
}

function startPTT(e) {
  if (pressingMic || recognition) return;
  if (!checkSpeechAPI()) {
    addMsg(activeAgent, 'Voz no disponible. Usa Chrome o Edge. 🎤', true, true);
    return;
  }
  pressingMic = true;
  speechTranscript = '';
  const btn = e.currentTarget || getActiveMicBtn();
  if (btn) btn.classList.add('recording');

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  try {
    recognition = new SpeechRecognition();
  } catch {
    addMsg(activeAgent, 'Voz no soportada en este navegador. 🎤', true, true);
    cleanMicState(); return;
  }
  recognition.lang = 'es-MX';
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onresult = (ev) => {
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      if (ev.results[i].isFinal) {
        speechTranscript += ev.results[i][0].transcript + ' ';
      }
    }
  };

  recognition.onerror = (ev) => {
    if (ev.error === 'aborted') { cleanMicState(); return; }
    if (ev.error === 'not-allowed') {
      addMsg(activeAgent, 'Permiso de micrófono denegado. Concede acceso e intenta de nuevo. 🎤', true, true);
    } else if (ev.error === 'audio-capture') {
      addMsg(activeAgent, 'No se detectó micrófono. Conecta uno e intenta de nuevo. 🎤', true, true);
    } else if (ev.error !== 'no-speech') {
      addMsg(activeAgent, `Error mic: ${ev.error} 🎤`, true, true);
    }
    cleanMicState();
  };

  recognition.onend = () => {
    if (speechTranscript.trim()) {
      const inputId = `chatInput${activeAgent==='sensei'?'Sensei':'Nova'}`;
      const input = document.getElementById(inputId);
      if (input) { input.value = speechTranscript.trim(); sendMsg(activeAgent); }
    }
    cleanMicState();
    speechTranscript = '';
  };

  recognition.start();
}

function stopPTT() {
  if (!recognition) return;
  pressingMic = false;
  recognition.stop();
}

function toggleTTS() {
  voiceEnabled = !voiceEnabled;
  const opacity = voiceEnabled ? '1' : '0.4';
  ['ttsToggle', 'ttsToggle2'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.style.opacity = opacity;
  });
}

// Image upload in chat
const chatImageInput = document.getElementById('chatImageInput');
if (chatImageInput) {
  chatImageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      const msg = prompt('¿Qué quieres saber sobre esta imagen?') || 'Describe esta imagen';
      addMsg(activeAgent, `[📷 Imagen enviada: ${msg}]`, false);
      const history = activeAgent === 'sensei' ? chatHistorySensei : chatHistoryNova;
      history.push({ role: 'user', content: `[Imagen] ${msg}` });
      const tid = 't' + Date.now();
      const msgs = document.getElementById(`chatMessages${activeAgent==='sensei'?'Sensei':'Nova'}`);
      if (msgs) {
        const typing = document.createElement('div');
        typing.className = 'msg msg-ai msg-typing';
        typing.id = tid;
        typing.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
        msgs.appendChild(typing);
      }
      try {
        const res = await fetch(`${API}/api/vision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imagen: base64, pregunta: msg })
        });
        const data = await res.json();
        document.getElementById(tid)?.remove();
        if (data.success) {
          addMsg(activeAgent, data.data.descripcion, true);
          history.push({ role: 'assistant', content: data.data.descripcion });
        } else throw new Error('Error');
      } catch {
        document.getElementById(tid)?.remove();
        addMsg(activeAgent, 'No pude analizar la imagen, guerrero.', true, true);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });
}

// Inicializar botones de voz
setupMicButtons();
