// Verdict vocabulary the gate acts on. A subset of the canonical Verdict union
// (legacy src/stores/overlayStore.ts) — the full Report shape lands with the real
// engine in Phase 2. Kept in its own module so the gate (MAIN world), the bridge
// (isolated world) and the engine Worker can all import it without pulling in DOM
// or worker-only code.
export type Verdict = 'clean' | 'infected' | 'unscannable' | 'error';

// The gate blocks an upload ONLY on an explicit 'infected'. EVERYTHING else —
// 'clean', 'unscannable', 'error', plus handshake/scan timeouts — fails OPEN
// (allow), so TrapGuard can never brick a user's uploads. This invariant is
// load-bearing: a bug in the engine must degrade to "let it through", never to
// "block everything".
export function shouldBlock(verdict: Verdict): boolean {
  return verdict === 'infected';
}
