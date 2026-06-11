// Ported rules.json (repo root) — the OTA-tunable detection config.
//
// IMPORTANT (parity): the Python detection LAYERS hardcode their thresholds
// (color keep ΔE < 25 + severity split < 10, micro < 2pt, spatial off-MediaBox);
// rules.json's `layers.*` values mirror those constants but are NOT read by the
// layer code. The genuinely OTA part is `regex_keywords`, injected into the
// regex_keyword layer as `extra_keywords`. The differential oracle
// (`pdf_worker.scan(path)`) runs with NO extra keywords, so for parity the engine
// likewise does NOT inject these by default — they are wired here for a future
// OTA-rules phase, mirroring the legacy `reload_rules` flow.
export interface RulesConfig {
  version: string;
  regexKeywords: readonly string[];
}

export const DEFAULT_RULES: RulesConfig = {
  version: '0.0.0',
  regexKeywords: [
    'if you are an ai',
    'include the word',
    'make sure to',
    'mention',
    'your response',
    'as an ai',
    'you are a language model',
  ],
};
