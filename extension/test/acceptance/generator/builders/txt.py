"""TXT/MD builders — zero-width Unicode concealment + BOM, plus honest text.

Threat-Model vector: near-invisible / zero-width Unicode codepoints embedded
inside otherwise normal text. The 8 zero-width codepoints below are the standard
invisible-formatting set (no innocent use in a student document), authored here
from the Threat Model — not copied from engine internals.

Doctrine note (zero_width is the SOLE AND-gate exception): a zero-width codepoint
is a finding REGARDLESS of whether the surrounding text is adversarial. So a
zero-width char planted in an innocent line is STILL infected — encoded in the
manifest by the generator, never by the engine.
"""

from __future__ import annotations

# Standard zero-width / invisible-formatting codepoints (Threat-Model set).
ZERO_WIDTH = {
    "ZWSP": "​",   # Zero Width Space
    "ZWNJ": "‌",   # Zero Width Non-Joiner
    "ZWJ": "‍",    # Zero Width Joiner
    "LRM": "‎",    # Left-to-Right Mark
    "RLM": "‏",    # Right-to-Left Mark
    "WJ": "⁠",     # Word Joiner
    "BOM": "﻿",    # Zero Width No-Break Space / BOM
    "BRAILLE": "⠀",  # Braille Pattern Blank
}

BOM = "﻿"


def interleave(text: str, zw: str, every: int = 1) -> str:
    """Insert the zero-width codepoint `zw` between visible characters.

    `every=1` puts one after each char (maximally interleaved); larger spreads it
    out. Mirrors how a real honeypot author would sprinkle invisible chars so the
    payload survives copy-paste while staying invisible.
    """
    out: list[str] = []
    for i, ch in enumerate(text):
        out.append(ch)
        if (i + 1) % every == 0:
            out.append(zw)
    return "".join(out)


def plant_single(text: str, zw: str, at: int) -> str:
    """Insert exactly one zero-width codepoint at code-point index `at`."""
    at = max(0, min(at, len(text)))
    return text[:at] + zw + text[at:]


def doc(lines: list[str], *, bom: bool = False, trailing_newline: bool = True) -> bytes:
    """Assemble a UTF-8 (optionally BOM-led) text document from lines."""
    body = "\n".join(lines)
    if trailing_newline:
        body += "\n"
    if bom:
        body = BOM + body
    return body.encode("utf-8")
