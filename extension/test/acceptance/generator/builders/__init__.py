"""Per-format real-document builders for the Phase 9 acceptance corpus.

Each builder is attacker-minded: it implements a concealment vector described in
the CLAUDE.md Threat Model using a normal document writer (fitz / python-docx /
python-pptx). None of them import or consult `trapguard_engine`.
"""
