/**
 * overlay/content-bootstrap.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Entry point for the overlay system. Runs after shadow-ui.js and
 * chat-controller.js have registered their factories on window.__sao.
 *
 * Responsibilities:
 *  1. Guard against double-injection (e.g. history navigation in SPAs)
 *  2. Generate a randomised, obfuscated custom-element tag name
 *  3. Create the shadow host and attach a mode:'closed' Shadow Root
 *  4. Delegate UI construction to window.__sao.buildUI()
 *  5. Delegate event wiring to window.__sao.initController()
 *  6. Expose the shadow host reference for the input-router (Phase 4)
 * ─────────────────────────────────────────────────────────────────────────────
 */
'use strict';

(function bootstrap() {

  // ── Guard: only inject once per document ──────────────────────────────────
  if (window.__sao && window.__sao.injected) return;
  window.__sao = window.__sao || {};
  window.__sao.injected = true;

  // ── Sanity check: dependencies must be loaded first ───────────────────────
  if (typeof window.__sao.buildUI !== 'function' ||
      typeof window.__sao.initController !== 'function') {
    console.error('[Bootstrap] shadow-ui.js or chat-controller.js failed to load.');
    return;
  }

  // ── Generate obfuscated tag name ──────────────────────────────────────────
  // Custom element names must contain a hyphen. We use a fixed prefix + a
  // random 6-char alphanumeric suffix generated fresh per page load.
  // This prevents static host-page scripts from keying off a known tag name.
  const suffix  = Math.random().toString(36).slice(2, 8);   // e.g. "a4f9b2"
  const tagName = `hgk-${suffix}`;                          // e.g. "hgk-a4f9b2"

  // ── Create the shadow host element ────────────────────────────────────────
  // The host is a full-viewport fixed layer with pointer-events:none so it
  // never intercepts mouse clicks intended for the underlying page.
  // Individual interactive elements inside the Shadow DOM set pointer-events:auto.
  const host = document.createElement(tagName);

  // Apply critical layout styles directly — these must not be overrideable
  // by host-page stylesheets, so they are set as inline styles (highest specificity
  // outside of !important, and our element tag is unknown to host CSS).
  const hs = host.style;
  hs.all            = 'initial';
  hs.display        = 'block';
  hs.position       = 'fixed';
  hs.top            = '0';
  hs.left           = '0';
  hs.width          = '100vw';
  hs.height         = '100vh';
  hs.zIndex         = '2147483647';   // Maximum possible z-index
  hs.pointerEvents  = 'none';
  hs.overflow       = 'visible';

  // ── Attach closed Shadow Root ─────────────────────────────────────────────
  // mode:'closed' means element.shadowRoot returns null from outside scripts.
  // We keep the reference internally — the host page cannot reach our DOM tree.
  const shadowRoot = host.attachShadow({ mode: 'closed' });

  // ── Build UI & wire controller ────────────────────────────────────────────
  const refs = window.__sao.buildUI(shadowRoot);
  window.__sao.initController(refs);

  // ── Expose host reference for the Input Router (Phase 4) ─────────────────
  // event-interceptor.js uses this to check event.composedPath() at capture time.
  window.__sao.shadowHost = host;

  // ── Mount into document ───────────────────────────────────────────────────
  // Append to <html> (documentElement) rather than <body> to survive any
  // host-page JS that might clear or replace document.body.
  document.documentElement.appendChild(host);

  console.debug(`[Bootstrap] Stealth AI Overlay mounted as <${tagName}>.`);

})();
