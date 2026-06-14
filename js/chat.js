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

function addMsg(agent, text, isAi, isError = false) {
  const msgs = document.getElementById(`chatMessages${agent==='sensei'?'Sensei':'Nova'}`);
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = 'msg' + (isAi ? ' msg-ai' : ' msg-user') + (isError ? ' msg-error' : '');
  if (isAi && !isError) {
    const badge = agent === 'nova'
      ? '<span style="font-size:.5rem;letter-spacing:1px;text-transform:uppercase;color:var(--blue);opacity:.7;display:block;margin-bottom:3px;">💙 Nova</span>'
      : '<span style="font-size:.5rem;letter-spacing:1px;text-transform:uppercase;color:var(--craft);opacity:.7;display:block;margin-bottom:3px;">⚔ Sensei</span>';
    div.innerHTML = badge + (isAi ? renderLinks(text) : text);
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

// Voice Recognition
let recognition = null;

function toggleVoice() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    alert('La entrada por voz no está disponible en este navegador. Usa Chrome o Edge.');
    return;
  }
  if (recognition) {
    recognition.stop();
    recognition = null;
    return;
  }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'es-MX';
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript;
    const inputId = `chatInput${activeAgent==='sensei'?'Sensei':'Nova'}`;
    const input = document.getElementById(inputId);
    if (input) input.value = text;
    recognition = null;
  };
  recognition.onerror = () => { recognition = null; };
  recognition.onend = () => { recognition = null; };
  recognition.start();
}

function toggleTTS() {
  voiceEnabled = !voiceEnabled;
  const btn = document.getElementById('ttsToggle');
  if (btn) btn.style.opacity = voiceEnabled ? '1' : '0.4';
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
