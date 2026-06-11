// Adversarial keyword intersection — ported 1:1 from
// engine/trapguard_engine/layers/keywords.py.
//
// Structural anomalies (hidden text, white-on-white, micro-font, off-slide
// position) are only flagged when extracted text ALSO matches these adversarial
// patterns. Innocent formatting artifacts (author notes, templates,
// accessibility text) never contain LLM-targeting language and pass through
// silently — no false positives.
//
// Parity notes vs. the Python `re` module:
// - `re.IGNORECASE` → the JS `i` flag.
// - NO `g` flag anywhere: `.test()` must stay stateless (a `g` regex carries
//   `lastIndex` between calls and would non-deterministically miss matches).
// - Python `\b` is Unicode-aware; JS `\b` is ASCII. Every `\b`-gated group here
//   targets ASCII English tokens, so the boundaries coincide. The Hebrew group
//   uses no `\b`, so RTL matching is unaffected.

// Direct LLM/AI identity references
const LLM_IDENTITY =
  /\b(AI|LLM|GPT|Claude|ChatGPT|Gemini|Copilot|Bard|language\s+model|artificial\s+intelligence|large\s+language|neural\s+net(?:work)?|machine\s+learning\s+model|assistant|chatbot|bot)\b/i;

// Instruction override / jailbreak verbs
const OVERRIDE =
  /\b(ignore|disregard|forget|override|bypass|overrule|discard|replace|supersede|dismiss|negate)\b/i;

// Instruction-target meta-words
const META =
  /\b(instruction|prompt|directive|command|rule|guideline|constraint|previous|prior|original|system|context|training)\b/i;

// Output-generation directives
const OUTPUT_DIRECTIVE =
  /\b(include|mention|say|write|add|output|respond|answer|use|insert|append|repeat|state|tell|produce|generate|provide|give|return|make\s+sure|always|ensure|remember\s+to)\b/i;

// Output-content targets
const OUTPUT_TARGET =
  /\b(word|phrase|sentence|code|snippet|string|answer|response|explanation|essay|paragraph|solution|submission|reply|output|keyword)\b/i;

// Conditional identity triggers: "if you are an AI", "you are a language model"
const CONDITIONAL =
  /(?:if\s+you\s+are|you\s+are\s+an?\s+|when\s+you\s+are|as\s+an?\s*(?:AI|LLM|assistant|model))/i;

// Canonical jailbreak templates. Mirrors the regex_keyword PDF layer so the SAME
// phrasing is recognized as adversarial by every structural layer that gates on
// isAdversarial — i.e. a *concealed* jailbreak is caught, not only a visible one.
// These phrases have no innocent use; structural layers only ever pass
// already-hidden text here, so no false-positive risk.
const JAILBREAK =
  /(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior)\s+instructions?|do\s+not\s+follow\s+(?:your\s+)?(?:previous|prior|original)\s+instructions?|you\s+are\s+now\s+a\s+different\s+(?:AI|assistant|model)|act\s+as\s+(?:if\s+you\s+are\s+)?a?\s*(?:DAN|jailbreak)|\bDAN\s+mode\b|\bjailbreak\s+mode\b|system\s+prompt\s+override|override\s+(?:the\s+)?system\s+prompt/i;

// "in your answer / response / output / essay" redirection
const IN_YOUR =
  /\b(?:in\s+your\s+|your\s+)(?:answer|response|output|reply|explanation|essay|summary|solution|work|submission)\b/i;

// Hebrew adversarial patterns (TrapGuard's market is Israeli; a professor may
// write the hidden instruction in Hebrew). High precision: AI identity terms,
// "if you are an AI" conditionals, "in your answer/response" redirection, and
// explicit "include/add the word" directives. Only ever applied to already-
// concealed text, so a visible Hebrew fair-warning is never reached / flagged.
const HEBREW =
  /בינה\s+מלאכותית|מודל\s+שפה|צ'?אט[\s-]*בוט|אם\s+אתה\s+(?:בינה|מודל|עוזר|בוט|מחשב)|כאשר\s+אתה\s+(?:בינה|מודל|עוזר|בוט)|ב(?:תשובה|תגובה|מענה|פלט)\s+שלך|(?:כלול|הוסף|שלב|ציין|כתוב)\s+את\s+ה?מילה/i;

/**
 * Return true if `text` contains adversarial LLM-targeting patterns.
 *
 * Structural layers call this before emitting a finding: anomaly + no
 * adversarial content = innocent artifact; skip silently to prevent false
 * positives. Match order mirrors keywords.py exactly.
 */
export function isAdversarial(text: string): boolean {
  if (!text.trim()) return false;
  if (LLM_IDENTITY.test(text)) return true;
  if (JAILBREAK.test(text)) return true;
  if (HEBREW.test(text)) return true;
  if (CONDITIONAL.test(text)) return true;
  if (IN_YOUR.test(text)) return true;
  if (OVERRIDE.test(text) && META.test(text)) return true;
  if (OUTPUT_DIRECTIVE.test(text) && OUTPUT_TARGET.test(text)) return true;
  return false;
}
