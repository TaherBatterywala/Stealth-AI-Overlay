/**
 * background/service-worker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The central nervous system of the Stealth AI Overlay.
 *
 * Responsibilities:
 *  1. Lifecycle  — Open and guard the hidden ChatGPT tab across SW restarts.
 *  2. Keep-alive — Prevent MV3 SW termination during active response streams.
 *  3. Shortcut   — Handle Alt+Shift+A to toggle the overlay on the active tab.
 *  4. Broker     — Route messages between the host tab overlay and the hidden
 *                  AI tab puppeteer.
 *
 * Message contract:
 *  HOST TAB → SW:
 *    { type: 'QUERY',          payload: string }  → forwards to hidden tab
 *  HIDDEN TAB → SW:
 *    { type: 'STREAM_CHUNK',   delta: string }    → relays to host tab
 *    { type: 'STREAM_DONE'                   }    → relays to host tab
 *  ANY → SW:
 *    { type: 'GET_HIDDEN_TAB_ID'             }    → returns { tabId }
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────

const HIDDEN_TAB_URL  = 'https://chatgpt.com/';
const ALARM_KEEPALIVE = 'stealth-overlay-keepalive';

/** Keys used in chrome.storage.session (survives SW restarts, cleared on browser close). */
const S = {
  HIDDEN_TAB_ID      : 'hiddenTabId',
  ACTIVE_HOST_TAB_ID : 'activeHostTabId',
  IS_STREAMING       : 'isStreaming',
};

// ─── Keep-Alive Mechanism ─────────────────────────────────────────────────────
// MV3 service workers terminate after ~30 s of inactivity.
// A repeating alarm (every 25 s) prevents eviction during active streams.

chrome.alarms.create(ALARM_KEEPALIVE, { periodInMinutes: 25 / 60 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_KEEPALIVE) return;
  // Lightweight storage ping — wakes the SW and resets its idle timer.
  chrome.storage.session.get(S.IS_STREAMING, () => {});
});

// ─── Initialization ───────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  console.log('[SW] onInstalled — reason:', reason);
  await ensureHiddenTab();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[SW] onStartup — browser launched.');
  await ensureHiddenTab();
});

// ─── Hidden Tab Lifecycle ─────────────────────────────────────────────────────

/**
 * Ensures the hidden AI tab exists and is alive.
 * Reads the stored tabId from session storage; if the tab is gone, creates a
 * fresh one and persists its new ID.
 *
 * @returns {Promise<number>} The tabId of the hidden AI tab.
 */
async function ensureHiddenTab() {
  const stored    = await chrome.storage.session.get(S.HIDDEN_TAB_ID);
  const storedId  = stored[S.HIDDEN_TAB_ID];

  if (storedId !== undefined) {
    try {
      const tab = await chrome.tabs.get(storedId);
      if (tab && !tab.discarded) {
        console.log('[SW] Hidden tab is alive. tabId:', storedId);
        return storedId;
      }
    } catch (_) {
      // Tab no longer exists — fall through to create a new one.
    }
  }

  return createHiddenTab();
}

/**
 * Opens a new pinned, muted, background tab pointing to the AI interface.
 * The tab is never made active so the user never sees it switch.
 *
 * @returns {Promise<number>} The tabId of the newly created tab.
 */
async function createHiddenTab() {
  const tab = await chrome.tabs.create({
    url    : HIDDEN_TAB_URL,
    active : false,   // Never steal focus from the user's active tab.
    pinned : true,    // Pinned = harder to accidentally close; visually subtle.
  });

  // Mute immediately so ChatGPT audio (if any) doesn't bleed through.
  await chrome.tabs.update(tab.id, { muted: true });

  await chrome.storage.session.set({ [S.HIDDEN_TAB_ID]: tab.id });
  console.log('[SW] Hidden tab created. tabId:', tab.id);
  return tab.id;
}

/**
 * If the user manually closes the hidden tab, silently recreate it.
 * This keeps the puppeteer always ready without user intervention.
 */
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const stored = await chrome.storage.session.get(S.HIDDEN_TAB_ID);
  if (stored[S.HIDDEN_TAB_ID] !== tabId) return;

  console.warn('[SW] Hidden tab was closed externally. Recreating...');
  await chrome.storage.session.remove(S.HIDDEN_TAB_ID);
  await createHiddenTab();
});

// ─── Keyboard Shortcut (Alt+Shift+A) ─────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-overlay') return;
  await dispatchToggle();
});

/** Fallback: clicking the extension toolbar icon also toggles the overlay. */
chrome.action.onClicked.addListener(async () => {
  await dispatchToggle();
});

/**
 * Sends a TOGGLE_OVERLAY message to the currently active host tab.
 * Skips chrome:// pages and the hidden AI tab itself (where no overlay exists).
 */
async function dispatchToggle() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) return;

  const stored = await chrome.storage.session.get(S.HIDDEN_TAB_ID);

  // Guard: never send toggle to the hidden AI tab.
  if (activeTab.id === stored[S.HIDDEN_TAB_ID]) {
    console.warn('[SW] Toggle ignored — active tab is the hidden AI tab.');
    return;
  }

  chrome.tabs.sendMessage(activeTab.id, { type: 'TOGGLE_OVERLAY' }).catch(() => {
    // Swallow: tab may be a chrome:// page where content scripts cannot run.
    console.warn('[SW] TOGGLE_OVERLAY could not reach tab:', activeTab.id);
  });
}

// ─── Message Broker ───────────────────────────────────────────────────────────

/**
 * Central message handler. Returns true to signal async response to Chrome.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((err) => {
      console.error('[SW] Unhandled error in message handler:', err);
      sendResponse({ error: err.message });
    });
  return true; // Keep the message channel open for async sendResponse.
});

/**
 * Routes each message type to the appropriate handler.
 *
 * @param {{ type: string, [key: string]: any }} message
 * @param {chrome.runtime.MessageSender} sender
 * @returns {Promise<object>}
 */
async function handleMessage(message, sender) {
  const { type } = message;

  switch (type) {

    // ── HOST TAB: User has submitted a prompt ─────────────────────────────
    case 'QUERY': {
      if (!sender.tab?.id) throw new Error('QUERY received from non-tab sender.');

      // Persist the host tab ID so stream chunks can be routed back to it.
      await chrome.storage.session.set({
        [S.ACTIVE_HOST_TAB_ID] : sender.tab.id,
        [S.IS_STREAMING]       : true,
      });

      const hiddenTabId = await ensureHiddenTab();

      await chrome.tabs.sendMessage(hiddenTabId, {
        type    : 'INJECT_PROMPT',
        payload : message.payload,
      });

      console.log('[SW] QUERY forwarded to hidden tab. host:', sender.tab.id, '→ hidden:', hiddenTabId);
      return { status: 'queued' };
    }

    // ── HIDDEN TAB: A streaming response delta arrived ────────────────────
    case 'STREAM_CHUNK': {
      const hostTabId = await getActiveHostTabId();
      if (hostTabId) {
        chrome.tabs.sendMessage(hostTabId, {
          type  : 'STREAM_CHUNK',
          delta : message.delta,
        }).catch(() => {});
      }
      return { status: 'relayed' };
    }

    // ── HIDDEN TAB: Response stream has completed ─────────────────────────
    case 'STREAM_DONE': {
      const hostTabId = await getActiveHostTabId();
      if (hostTabId) {
        chrome.tabs.sendMessage(hostTabId, { type: 'STREAM_DONE' }).catch(() => {});
      }
      await chrome.storage.session.set({ [S.IS_STREAMING]: false });
      console.log('[SW] Stream complete. Host tab notified.');
      return { status: 'done' };
    }

    // ── UTILITY: Any module can request the hidden tab ID ─────────────────
    case 'GET_HIDDEN_TAB_ID': {
      const tabId = await ensureHiddenTab();
      return { tabId };
    }

    default:
      throw new Error(`[SW] Unknown message type: "${type}"`);
  }
}

/**
 * Retrieves the currently active host tab ID from session storage.
 * @returns {Promise<number|null>}
 */
async function getActiveHostTabId() {
  const stored = await chrome.storage.session.get(S.ACTIVE_HOST_TAB_ID);
  return stored[S.ACTIVE_HOST_TAB_ID] ?? null;
}
