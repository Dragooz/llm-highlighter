# LLM Highlighter — Journey Log

Evolution of the product, milestone by milestone.

---

## v0.1 — Init (a528cf7)
- First commit. Bare bones.

## v0.2 — Backend + Extension (2820839)
- Initialize backend (Node/Express) and Chrome MV3 extension
- Basic highlight-text → send-to-LLM flow

## v0.3 — Bot Structure Rework (9244984)
- Restructured how extension communicates with backend
- Updated bot interaction model

## v0.4 — UI Polish (f121771, 305f655, 855b177)
- Better tone in responses
- Improved UI layout
- Fixed button stacking bug
- More user-friendly extension interface

## v0.5 — Deployment Prep (680f04f, b5eeb37)
- Prepped for deployment
- Removed Dockerfile, switched to Railpack

## v0.6 — Cost Optimization (137ac62)
- Switched default model to minimax2.7 (cheaper)

## v0.7 — Redis + Streaming (815a375, 54fc8f8)
- Moved .txt files into Redis
- Added streaming responses
- Switched to DeepSeek model
- Updated theme

---

## Feedback Log

### 2026-05-12 — User feedback (first round)

1. **Prompt too lengthy** — users want quick answers, not essays. Need caveman-style: concise + reference links. Straight to the point.
2. **Highlighter UX is annoying** — selecting text + clicking = too many steps. Proposal: floating chat widget with conversation, appears only on Pepper Cloud website.
3. **Feedback loop too hard** — users won't manually report issues. Proposal: record user activity (chat history + Pepper Cloud page activity), digest daily into knowledge bank.

**Clarified:**
- Domain: `app.peppercloud.com`
- No activity monitoring — just record chat conversations
- Team-wide shared knowledge (Upstash Redis)
- Daily digest: summarize conversations → update shared knowledge base
- Inspired by Karpathy's LLM Wiki pattern (compile once, keep current)

**Status:** Planning v1.0 pivot — highlighter → floating chat + knowledge pipeline
