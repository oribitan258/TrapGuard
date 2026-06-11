// Message contract for the bridge ⇄ engine-Worker channel.
import type { Verdict } from './verdict';
import type { Report } from './schema';

export interface PingMessage {
  type: 'ping';
}

export interface PongMessage {
  type: 'pong';
  engine: 'trapguard';
  phase: number;
}

/** Bridge → Worker: scan this File and report a verdict. */
export interface ScanMessage {
  type: 'scan';
  /** Correlation id; echoed back on the matching report. */
  id: string;
  /** Files are structured-cloneable, so they cross postMessage intact. */
  file: File;
}

/** Worker → Bridge: the full Report for a prior scan request.
 *  Phase 5: `report` carries the verbatim payload so the bridge can show the
 *  Alert & Reveal overlay. The gate still acts only on `verdict`. */
export interface ReportMessage {
  type: 'report';
  id: string;
  verdict: Verdict;
  report: Report;
}

/** Messages the bridge sends INTO the worker. */
export type WorkerInbound = PingMessage | ScanMessage;

/** Messages the worker sends OUT to the bridge. */
export type WorkerOutbound = PongMessage | ReportMessage;
