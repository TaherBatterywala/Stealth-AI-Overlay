/**
 * overlay/chat-controller.js
 * Wires all UI interactions and handles the full message lifecycle.
 * Depends on: window.__sao (set by shadow-ui.js)
 * Exposes: window.__sao.initController({ panel, msgList, welcome, textarea, sendBtn, minBtn, closeBtn })
 */
'use strict';

window.__sao = window.__sao || {};

window.__sao.initController = function ({ panel, header, msgList, welcome, textarea, sendBtn, minBtn, closeBtn }) {

  // ── State ────────────────────────────────────────────────────────────────
  let isStreaming  = false;
  let isMinimized  = false;
  let activeAIBubble = null;  // The bubble currently receiving stream tokens
  let thinkingEl     = null;

  // ── SW Message Listener ───────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    switch (msg.type) {
      case 'TOGGLE_OVERLAY': togglePanel(); break;
      case 'STREAM_CHUNK':   onChunk(msg.delta); break;
      case 'STREAM_DONE':    onDone(); break;
    }
  });

  // ── Panel Toggle ─────────────────────────────────────────────────────────
  function togglePanel() {
    if (isMinimized) { expandPanel(); return; }
    panel.classList.toggle('visible');
    if (panel.classList.contains('visible')) textarea.focus();
  }

  function expandPanel() {
    isMinimized = false;
    panel.style.height = '';
    panel.style.overflow = '';
  }

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.remove('visible');
  });

  minBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isMinimized = true;
    panel.style.height = '48px';
    panel.style.overflow = 'hidden';
  });

  // ── Drag ─────────────────────────────────────────────────────────────────
  let dragging = false, ox = 0, oy = 0, startRight = 0, startBottom = 0;

  header.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.target.closest('.hbtn')) return;
    dragging = true;
    ox = e.clientX;
    oy = e.clientY;
    const r = panel.getBoundingClientRect();
    startRight  = window.innerWidth  - r.right;
    startBottom = window.innerHeight - r.bottom;
    panel.style.transition = 'none';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - ox;
    const dy = e.clientY - oy;
    panel.style.right  = `${Math.max(0, startRight  - dx)}px`;
    panel.style.bottom = `${Math.max(0, startBottom - dy)}px`;
    panel.style.left   = 'auto';
    panel.style.top    = 'auto';
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    panel.style.transition = '';
  });

  // ── Send Message ─────────────────────────────────────────────────────────
  sendBtn.addEventListener('click', sendMessage);

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    // Auto-grow textarea
    setTimeout(autoGrow, 0);
  });

  textarea.addEventListener('input', autoGrow);

  function autoGrow() {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  function sendMessage() {
    if (isStreaming) return;
    const text = textarea.value.trim();
    if (!text) return;

    // Remove welcome screen on first message
    if (welcome && welcome.parentNode) welcome.remove();

    appendUserMessage(text);
    textarea.value = '';
    textarea.style.height = '';
    sendBtn.disabled = true;
    isStreaming = true;

    showThinking();
    chrome.runtime.sendMessage({ type: 'QUERY', payload: text });
  }

  // ── Message Rendering ─────────────────────────────────────────────────────
  function appendUserMessage(text) {
    const msg  = make('div', 'msg user');
    const bub  = make('div', 'bubble');
    bub.textContent = text;
    const time = make('div', 'msg-time');
    time.textContent = timestamp();
    msg.append(bub, time);
    msgList.appendChild(msg);
    scrollBottom();
  }

  function showThinking() {
    removeThinking();
    thinkingEl = make('div', 'thinking');
    for (let i = 0; i < 3; i++) {
      const d = make('div', 'tdot');
      thinkingEl.appendChild(d);
    }
    msgList.appendChild(thinkingEl);
    scrollBottom();
  }

  function removeThinking() {
    if (thinkingEl) { thinkingEl.remove(); thinkingEl = null; }
  }

  function startAIMessage() {
    removeThinking();
    const msg    = make('div', 'msg ai');
    const bub    = make('div', 'bubble');
    const cursor = make('span', 'cursor');
    bub.appendChild(cursor);
    const time   = make('div', 'msg-time');
    time.textContent = timestamp();
    msg.append(bub, time);
    msgList.appendChild(msg);
    activeAIBubble = { bub, cursor, time };
    scrollBottom();
    return activeAIBubble;
  }

  // ── Stream Handlers ───────────────────────────────────────────────────────
  function onChunk(delta) {
    if (!activeAIBubble) startAIMessage();
    const { bub, cursor } = activeAIBubble;
    // Insert text node before the cursor
    const textNode = document.createTextNode(delta);
    bub.insertBefore(textNode, cursor);
    scrollBottom();
  }

  function onDone() {
    if (activeAIBubble) {
      activeAIBubble.cursor.remove();
      activeAIBubble = null;
    }
    removeThinking();
    isStreaming  = false;
    sendBtn.disabled = false;
    textarea.focus();
    scrollBottom();
  }

  // ── Utilities ─────────────────────────────────────────────────────────────
  function scrollBottom() {
    msgList.scrollTop = msgList.scrollHeight;
  }

  function timestamp() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function make(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }
};
