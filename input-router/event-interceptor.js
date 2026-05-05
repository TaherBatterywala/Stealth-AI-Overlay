/**
 * input-router/event-interceptor.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PHASE 4 — Keyboard Event Interceptor. Runs in the Isolated World.
 *
 * Responsibilities (Phase 4):
 *  - Attach capture-phase listeners for keydown, keyup, keypress on window
 *  - On each event: check if the target (or any ancestor) lives inside our
 *    closed Shadow Root using a stored reference from content-bootstrap.js
 *  - If yes: call event.stopPropagation() + event.stopImmediatePropagation()
 *    to prevent host-page shortcut handlers and form listeners from firing
 *  - If no: let the event pass through to the host page normally
 * ─────────────────────────────────────────────────────────────────────────────
 * STATUS: STUB — Implementation begins in Phase 4.
 */

'use strict';

console.debug('[InputRouter] event-interceptor.js loaded (stub).');
