# SPEC-COVERAGE — CLAUDE.md doctrine → acceptance test(s)

Audit matrix: every user-facing doctrine maps to ≥1 acceptance test. No unmapped
doctrine. (V = vitest acceptance suite; E2E = `extension/e2e/acceptance`.)

| Doctrine (CLAUDE.md) | Where it lives | Covered by |
|---|---|---|
| **Visible = CLEAN (Fair Warning)** — visible AI instructions must NOT be flagged | Threat Model | `detection_tn_fp` (visible EN+HE warnings, all formats; QA-05 codifies "visible only") |
| **Hidden = THREAT** — concealed adversarial keyword is a finding | Threat Model | `detection_tp` (one fixture per vector × format, EN+HE) |
| **Two-condition AND-gate** — anomaly AND keyword; neither alone | Threat Model | `and_gate` (anomaly_only / keyword_only / both, per structural layer) |
| **`zero_width` is the sole AND-gate exception** | Threat Model | `detection_tp` (all 8 codepoints; innocent-line-still-infected case) |
| **Alert & Reveal** — verbatim payload, layer, location | Threat Model (HIGHEST) | `alert_reveal` (payload non-empty + contains planted reveal-word + location key) |
| **`extracted_text` NEVER empty** | Verdict/Data Shapes | `alert_reveal` (`assertThreatShape`) |
| **Schema/enum validity** (`Report`/`ThreatItem`/`Verdict`/`Layer`/`Severity`) | Verdict/Data Shapes | `alert_reveal` (`assertReportShape` + valid-layer/severity sets) |
| **TXT/MD `zero_width`** + single-leading-BOM strip | Detection Engine | `detection_tp` (zw + BOM coexist), `detection_tn_fp` (BOM-led plain → clean) |
| **PDF: color_threshold / micro_font / spatial / z_index / regex_keyword** | Detection Engine | `detection_tp` + `and_gate` (per-layer) |
| **PDF Hebrew/RTL aggregation** | Detection Engine | `detection_tp` (`pdf-tp-hebrew-*`) |
| **PDF image-only → `unscannable`** | Detection Engine | `robustness` (`pdf-rb-image-only`) |
| **DOCX: hidden_attr / white_on_white / tiny_font** | Detection Engine | `detection_tp` + `and_gate` |
| **PPTX: speaker_notes / off_slide** | Detection Engine | `detection_tp` + `and_gate` |
| **`is_adversarial` precision (no FP on innocents)** | Detection Engine | `detection_tn_fp` (near-keyword innocents, concealed-but-innocent, EN+HE) |
| **Robustness: CORRUPT / ENCRYPTED / OVERSIZED / empty** | Phase 7 | `robustness` + existing `test/robustness.test.ts` (OVERSIZED) |
| **Unified engine — ONE `scan()` seam for every vector** | Scan Entry Points | whole suite routes through `src/engine/scan.ts`; E2E `unified_vectors` (picker/drag/paste) |
| **Gate awaits verdict; blocks `infected` via AbortError (fetch AND XHR)** | Runtime Model | E2E `gate` |
| **Gate fails OPEN on non-`infected`** | Runtime Model | E2E `gate` (engine-error → allow); `robustness` (structured error, no throw) |
| **100% local — file bytes never leave; zero external network** | Rules | E2E `privacy_zero_network` |
| **Hebrew sole UI language; `dir=rtl lang=he`; no English UI prose** | Language & RTL Mandate | E2E `hebrew_rtl` (allowlist per Guardrail 2) |
| **Shadow DOM isolation — styles never leak** | Runtime Model / Rules | E2E `shadow_dom` |
| **Alert & Reveal in the live overlay** (Hebrew layer desc + location, block/allow) | Phase 5 | E2E `alert_reveal` |
| **Performance — large docs scan < 3 s** | Test angle H | existing `test/perf.test.ts` (200-pg PDF, 8000-para DOCX) |

## Frontier (Tier-2 — maps the ceiling, not a doctrine guarantee)
| Probe | Test | Status |
|---|---|---|
| Novel jailbreak phrasing (keyword-list gap) | `frontier` `fr-novel-jailbreak` | QA-07 — approved Known Limitation (`xfail`) |
| Regex obfuscation (spaced letters) | `frontier` `fr-spaced-jailbreak` | QA-08 — approved Known Limitation (`xfail`) |
| Bidi-override codepoints (Trojan Source) | `frontier` `fr-bidi-override` | QA-09 — **FIXED** (added to `zero_width`, both engines) |
| Combined concealment (color+micro) | `frontier` `fr-combined-micro-color` | green |
