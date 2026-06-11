# Acceptance suite (Phase 9 — independent, doctrine-anchored)

A second test pillar alongside the differential parity suite. Where the
differential tests prove the TS engine **agrees** with the Python oracle (both
authored next to the engine), these tests prove the engine **fulfils the
CLAUDE.md vision** — using real documents authored from an adversary / honest-
professor mindset, with expected verdicts taken from doctrine, never from the
engine.

## The independence guarantee

1. The corpus generator (`generator/**`) is authored from the **Threat Model +
   doctrines in CLAUDE.md**, not from engine source. It must **not** import
   `trapguard_engine` or the TS engine — enforced by a grep check (see
   `_isolation` in `independence.test.ts`).
2. Each fixture's expected verdict/layer/payload is set by the generator's **own
   intent label** (e.g. "white-on-white embedding an adversarial sentence →
   infected / `white_on_white`"; "visible 'do not use AI' line → clean per
   Visible-vs-Hidden").
3. `scan()` output is asserted **against `manifest.json`**, never used to write it.
4. A startup oracle-integrity table (`payloads._assert_pool_integrity`,
   human-meaningful, not engine-based): adversarial payloads must read as hidden
   AI instructions; innocent ones must not name an AI. A mislabelled fixture is a
   config error, caught before any bytes are written.

## Layout

```
manifest.json              # frozen, doctrine-labelled expectations (committed)
corpus/{pdf,docx,pptx,txt} # frozen real fixtures (committed)
generator/
  gen_corpus.py            # entry: emits corpus/** + manifest.json
  payloads.py              # adversarial / innocent / visible-warning pools (EN+HE)
  builders/{pdf,docx,pptx,txt}.py   # attacker-minded real-document writers
_manifest.ts               # typed loader + File factory (asserts vs manifest only)
detection_tp.test.ts       # Tier-1 true positives, per layer × format
detection_tn_fp.test.ts    # Tier-1 false-positive hardening (heaviest class)
and_gate.test.ts           # two-condition AND-gate matrix per structural layer
alert_reveal.test.ts       # verbatim payload + location + schema contract
robustness.test.ts         # corrupt / encrypted / image-only / empty
frontier.test.ts           # Tier-2 beyond-spec (may xfail → QA-BACKLOG)
independence.test.ts       # enforces Guardrail 1 (no engine import in generator)
SPEC-COVERAGE.md           # doctrine → test(s) matrix
```

## Run

```bash
cd extension
pnpm test:acceptance        # just this suite (vitest)
pnpm test                   # full suite (folds acceptance in)
```

## Regenerate the corpus (only after an intentional change)

The generator needs PyMuPDF / python-docx / python-pptx as document **writers**.
They live in the legacy engine venv, so run with that project (the generator
still never imports the engine itself):

```bash
# from the repo root
uv run --project legacy/engine python extension/test/acceptance/generator/gen_corpus.py
```

The committed `corpus/**` + `manifest.json` are the frozen source of truth; the
vitest suite re-scans the same bytes with the real TS engine and asserts every
verdict/layer/payload/location matches the doctrine label.
