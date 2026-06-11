// Cross-world wire protocol between the MAIN-world gate and the isolated-world
// bridge. They share the same frame's `window` but NOT the same JS heap, so they
// can only talk over window.postMessage. Every message is stamped with a versioned
// channel tag and a per-extension-load nonce so each side ignores unrelated page
// postMessage traffic (and so two TrapGuard instances can't cross wires).
//
// Threat-model note: the nonce is announced over postMessage, so a hostile page
// script *could* observe it. That is acceptable for Phase 1 — a forged
// scan-request only yields a stub verdict echoed back to the page, which cannot
// affect the gate's own id-correlated verdicts. The host page is not in the
// TrapGuard threat model (the adversary is the uploaded FILE, not the AI site).
import type { Verdict } from './engine/verdict';

export const TG_CHANNEL = 'trapguard:gate-bridge:v1';

/** Bridge → gate: "I'm up, here's the nonce to stamp on scan requests." */
export interface BridgeHello {
  channel: typeof TG_CHANNEL;
  kind: 'bridge-hello';
  nonce: string;
}

/** Gate → bridge: "I'm up (maybe before you were) — (re)announce your nonce." */
export interface GateHello {
  channel: typeof TG_CHANNEL;
  kind: 'gate-hello';
}

/** Gate → bridge: hold this upload; scan the File and tell me the verdict. */
export interface ScanRequest {
  channel: typeof TG_CHANNEL;
  kind: 'scan-request';
  nonce: string;
  id: string;
  file: File;
}

/** Bridge → gate: the verdict for a prior scan-request. */
export interface ScanVerdict {
  channel: typeof TG_CHANNEL;
  kind: 'scan-verdict';
  nonce: string;
  id: string;
  verdict: Verdict;
  reason?: string;
}

/**
 * Bridge → gate: whether interception is active for this host right now.
 * The MAIN-world gate has no chrome.* access, so the isolated-world bridge reads
 * the pause flag + per-host enable map and pushes the result here (on handshake
 * and whenever the relevant storage changes). The gate fails toward ON: it stays
 * active until told otherwise, so a slow config never drops protection.
 */
export interface GateConfig {
  channel: typeof TG_CHANNEL;
  kind: 'gate-config';
  nonce: string;
  active: boolean;
}

export type CrossWorldMessage =
  | BridgeHello
  | GateHello
  | ScanRequest
  | ScanVerdict
  | GateConfig;

/** Cheap structural guard: is this postMessage payload one of ours? */
export function isCrossWorldMessage(data: unknown): data is CrossWorldMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { channel?: unknown }).channel === TG_CHANNEL
  );
}
