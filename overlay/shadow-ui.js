/**
 * overlay/shadow-ui.js
 * Builds the Shadow DOM element tree and injects scoped styles.
 * Exposes: window.__sao.buildUI(shadowRoot) → { panel, messageList, textarea, sendBtn, header }
 */
'use strict';

window.__sao = window.__sao || {};

window.__sao.buildUI = function (shadowRoot) {

  // ── Scoped Styles ─────────────────────────────────────────────────────────
  const CSS = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :host {
      all: initial;
      display: block;
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      pointer-events: none;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    /* ── Panel ── */
    .panel {
      position: absolute;
      bottom: 28px;
      right: 28px;
      width: 400px;
      height: 580px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-radius: 18px;
      border: 1px solid rgba(100, 119, 254, 0.22);
      background: rgba(11, 12, 21, 0.93);
      backdrop-filter: blur(28px) saturate(1.5);
      -webkit-backdrop-filter: blur(28px) saturate(1.5);
      box-shadow:
        0 40px 80px rgba(0, 0, 0, 0.65),
        0 0 0 1px rgba(255, 255, 255, 0.04),
        inset 0 1px 0 rgba(255, 255, 255, 0.07);
      opacity: 0;
      transform: translateY(18px) scale(0.97);
      pointer-events: none;
      transition: opacity 0.28s cubic-bezier(0.4,0,0.2,1),
                  transform 0.28s cubic-bezier(0.4,0,0.2,1);
    }
    .panel.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    /* ── Header ── */
    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 13px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      background: rgba(255,255,255,0.025);
      cursor: grab;
      user-select: none;
      flex-shrink: 0;
    }
    .header:active { cursor: grabbing; }

    .header-icon {
      width: 30px;
      height: 30px;
      border-radius: 9px;
      background: linear-gradient(135deg, #6477fe 0%, #a78bfa 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      flex-shrink: 0;
      box-shadow: 0 0 14px rgba(100,119,254,0.45);
    }

    .header-text { flex: 1; min-width: 0; }
    .header-title {
      font-size: 13.5px;
      font-weight: 700;
      color: #e4e6f2;
      letter-spacing: 0.01em;
    }
    .header-sub {
      font-size: 10.5px;
      color: #6477fe;
      font-weight: 500;
      margin-top: 1px;
    }

    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #22c55e;
      box-shadow: 0 0 7px rgba(34,197,94,0.7);
      flex-shrink: 0;
      animation: pulse-dot 2.2s ease-in-out infinite;
    }
    @keyframes pulse-dot {
      0%,100% { opacity: 1; }
      50%      { opacity: 0.55; }
    }

    .header-actions { display: flex; gap: 5px; }
    .hbtn {
      width: 24px;
      height: 24px;
      border-radius: 7px;
      border: none;
      background: rgba(255,255,255,0.07);
      color: #7a7f9a;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      transition: background 0.15s, color 0.15s;
      line-height: 1;
    }
    .hbtn:hover { background: rgba(255,255,255,0.13); color: #e4e6f2; }
    .hbtn.close:hover { background: rgba(255,75,75,0.22); color: #ff6b6b; }

    /* ── Message List ── */
    .msg-list {
      flex: 1;
      overflow-y: auto;
      padding: 14px 14px 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      scroll-behavior: smooth;
    }
    .msg-list::-webkit-scrollbar { width: 3px; }
    .msg-list::-webkit-scrollbar-thumb {
      background: rgba(100,119,254,0.3);
      border-radius: 2px;
    }

    /* ── Welcome State ── */
    .welcome {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      text-align: center;
      padding: 24px;
      animation: msg-in 0.3s ease forwards;
    }
    .welcome-icon {
      font-size: 36px;
      filter: drop-shadow(0 0 12px rgba(100,119,254,0.5));
    }
    .welcome-title {
      font-size: 15px;
      font-weight: 700;
      color: #e4e6f2;
    }
    .welcome-hint {
      font-size: 12px;
      color: #4e526e;
      line-height: 1.5;
    }

    /* ── Messages ── */
    .msg {
      display: flex;
      flex-direction: column;
      max-width: 88%;
      animation: msg-in 0.22s cubic-bezier(0.4,0,0.2,1) forwards;
    }
    @keyframes msg-in {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .msg.user { align-self: flex-end; align-items: flex-end; }
    .msg.ai   { align-self: flex-start; align-items: flex-start; }

    .bubble {
      padding: 10px 14px;
      border-radius: 14px;
      font-size: 13.5px;
      line-height: 1.6;
      word-break: break-word;
      white-space: pre-wrap;
    }
    .msg.user .bubble {
      background: linear-gradient(135deg, #6477fe, #a78bfa);
      color: #fff;
      border-bottom-right-radius: 4px;
      box-shadow: 0 4px 18px rgba(100,119,254,0.35);
    }
    .msg.ai .bubble {
      background: rgba(255,255,255,0.05);
      color: #d8daf0;
      border: 1px solid rgba(255,255,255,0.08);
      border-bottom-left-radius: 4px;
    }
    .msg-time {
      font-size: 10px;
      color: #393d55;
      margin-top: 4px;
      padding: 0 3px;
    }

    /* ── Thinking Dots ── */
    .thinking {
      display: flex;
      gap: 5px;
      align-items: center;
      padding: 12px 16px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 14px;
      border-bottom-left-radius: 4px;
      align-self: flex-start;
      animation: msg-in 0.2s ease forwards;
    }
    .tdot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #6477fe;
      animation: tdot 1.3s ease-in-out infinite;
    }
    .tdot:nth-child(2) { animation-delay: 0.18s; background: #8b72fc; }
    .tdot:nth-child(3) { animation-delay: 0.36s; background: #a78bfa; }
    @keyframes tdot {
      0%,60%,100% { transform: translateY(0); opacity: 0.4; }
      30%          { transform: translateY(-6px); opacity: 1; }
    }

    /* ── Stream Cursor ── */
    .cursor {
      display: inline-block;
      width: 2px;
      height: 0.95em;
      background: #6477fe;
      margin-left: 2px;
      vertical-align: text-bottom;
      border-radius: 1px;
      animation: cur-blink 0.75s ease-in-out infinite;
    }
    @keyframes cur-blink {
      0%,100% { opacity: 1; }
      50%      { opacity: 0; }
    }

    /* ── Divider ── */
    .divider {
      flex-shrink: 0;
      height: 1px;
      background: rgba(255,255,255,0.05);
      margin: 0;
    }

    /* ── Input Row ── */
    .input-row {
      display: flex;
      align-items: flex-end;
      gap: 10px;
      padding: 12px 14px;
      background: rgba(255,255,255,0.02);
      flex-shrink: 0;
    }
    .input-wrap {
      flex: 1;
      position: relative;
    }
    .inp {
      width: 100%;
      min-height: 40px;
      max-height: 120px;
      padding: 10px 14px;
      border-radius: 12px;
      border: 1px solid rgba(100,119,254,0.18);
      background: rgba(255,255,255,0.05);
      color: #dde0f0;
      font-size: 13.5px;
      font-family: inherit;
      resize: none;
      outline: none;
      line-height: 1.5;
      transition: border-color 0.2s, background 0.2s;
      scrollbar-width: none;
    }
    .inp::placeholder { color: #3e4260; }
    .inp:focus {
      border-color: rgba(100,119,254,0.5);
      background: rgba(255,255,255,0.07);
    }
    .inp::-webkit-scrollbar { display: none; }

    .send-btn {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      border: none;
      background: linear-gradient(135deg, #6477fe, #a78bfa);
      color: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      box-shadow: 0 4px 14px rgba(100,119,254,0.4);
      transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
    }
    .send-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(100,119,254,0.55);
    }
    .send-btn:active { transform: translateY(0); }
    .send-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
    .send-btn svg { pointer-events: none; }

    /* ── Footer hint ── */
    .footer-hint {
      text-align: center;
      font-size: 10px;
      color: #272a3d;
      padding: 0 14px 10px;
      flex-shrink: 0;
    }
  `;

  const sheet = new CSSStyleSheet();
  sheet.replaceSync(CSS);
  shadowRoot.adoptedStyleSheets = [sheet];

  // ── DOM Tree ─────────────────────────────────────────────────────────────
  const panel = el('div', 'panel');

  // Header
  const header = el('div', 'header');
  const headerIcon = el('div', 'header-icon');
  headerIcon.textContent = '⟡';
  const headerText = el('div', 'header-text');
  const headerTitle = el('div', 'header-title');
  headerTitle.textContent = 'Stealth AI';
  const headerSub = el('div', 'header-sub');
  headerSub.textContent = 'Focus-Locked • Private';
  headerText.append(headerTitle, headerSub);
  const statusDot = el('div', 'status-dot');
  const headerActions = el('div', 'header-actions');
  const minBtn  = hBtn('−', 'min',   'Minimize');
  const closeBtn = hBtn('✕', 'close', 'Close overlay');
  headerActions.append(minBtn, closeBtn);
  header.append(headerIcon, headerText, statusDot, headerActions);

  // Message area
  const msgList = el('div', 'msg-list');
  const welcome = el('div', 'welcome');
  const wIcon   = el('div', 'welcome-icon');
  wIcon.textContent = '⟡';
  const wTitle  = el('div', 'welcome-title');
  wTitle.textContent = 'Stealth AI is ready';
  const wHint   = el('div', 'welcome-hint');
  wHint.textContent = 'Type a message below.\nThe host page will never know.';
  welcome.append(wIcon, wTitle, wHint);
  msgList.appendChild(welcome);

  // Divider
  const divider = el('div', 'divider');

  // Input row
  const inputRow  = el('div', 'input-row');
  const inputWrap = el('div', 'input-wrap');
  const textarea  = document.createElement('textarea');
  textarea.className   = 'inp';
  textarea.placeholder = 'Ask anything… (Enter to send)';
  textarea.rows        = 1;
  textarea.id          = 'sao-input';
  inputWrap.appendChild(textarea);
  const sendBtn = document.createElement('button');
  sendBtn.className = 'send-btn';
  sendBtn.id        = 'sao-send';
  sendBtn.title     = 'Send (Enter)';
  sendBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
  inputRow.append(inputWrap, sendBtn);

  // Footer
  const footer = el('div', 'footer-hint');
  footer.textContent = 'Alt+Shift+A to toggle • Shift+Enter for new line';

  panel.append(header, msgList, divider, inputRow, footer);
  shadowRoot.appendChild(panel);

  return { panel, header, msgList, welcome, textarea, sendBtn, minBtn, closeBtn };

  // ── Helpers ───────────────────────────────────────────────────────────────
  function el(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }
  function hBtn(text, cls, title) {
    const b = document.createElement('button');
    b.className = `hbtn ${cls}`;
    b.textContent = text;
    b.title = title;
    return b;
  }
};
