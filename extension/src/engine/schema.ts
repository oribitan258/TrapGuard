// Engine output shapes — ported VERBATIM from the Python source of truth
// (engine/trapguard_engine/schema.py) and the legacy overlay store
// (src/stores/overlayStore.ts). Closed enums must stay in lockstep with both.
//
// `Report` mirrors the Python worker return type (schema.py `Report` TypedDict):
// the unified engine produces this; the bridge/worker dispatch derives the gate
// Verdict from `report.verdict`. The id/elapsed_ms/timestamp fields the legacy
// Rust dispatch added are NOT the engine's concern.
import type { Verdict } from './verdict';

// ── Closed enums (lockstep with schema.py / overlayStore.ts) ────────────────

export type Layer =
  | 'color_threshold'
  | 'micro_font'
  | 'spatial'
  | 'z_index'
  | 'regex_keyword'
  | 'hidden_attr'
  | 'white_on_white'
  | 'tiny_font'
  | 'speaker_notes'
  | 'off_slide'
  | 'zero_width';

export type Severity = 'low' | 'medium' | 'high';

export type FileType = 'pdf' | 'docx' | 'pptx' | 'txt' | 'md';

export type ErrorCode =
  | 'ENCRYPTED'
  | 'CORRUPT'
  | 'UNSUPPORTED'
  | 'TIMEOUT'
  | 'IO'
  | 'INTERNAL'
  // Browser-only (Phase 7): the file exceeds the in-Worker size limit. The
  // Python oracle never emits this (it streams from disk) and no differential
  // corpus file triggers it, so this is intentionally NOT mirrored in schema.py
  // (the legacy Rust↔Python IPC enum). The TS engine is the live source of truth.
  | 'OVERSIZED';

// ── IPC payload shapes (overlayStore.ts / schema.py) ────────────────────────

export interface FileInfo {
  path: string;
  type: FileType;
  size_bytes: number;
  pages: number | null;
}

export interface ThreatItem {
  layer: Layer;
  severity: Severity;
  location: Record<string, unknown>;
  /** Verbatim hidden text — the Alert & Reveal core value. Never empty. */
  extracted_text: string;
  details?: Record<string, unknown>;
}

export interface ErrorResult {
  code: ErrorCode;
  message: string;
}

/**
 * Worker return type — the `ScanResult` minus id/type/elapsed_ms (which the
 * legacy Rust dispatch loop added). Matches schema.py `Report`.
 */
export interface Report {
  ok: boolean;
  file: FileInfo;
  verdict: Verdict;
  threats: ThreatItem[];
  sanitized: boolean;
  error: ErrorResult | null;
  /** Human-readable explanation for non-clean/non-infected verdicts. */
  reason?: string | null;
}
