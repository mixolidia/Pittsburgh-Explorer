---
name: Gemini model access
description: Lessons about direct Gemini API model availability for the Pittsburgh city guide.
---

**Rule:** Treat model access as key-specific. Keep `GEMINI_MODEL` overridable and use a currently supported default rather than assuming every API key can call older models.

**Why:** This project's configured key received a model-not-found response for `gemini-2.5-flash`; current Google documentation notes access to 2.5 models is limited for new projects, while newer Flash models are available.

**How to apply:** If a Gemini request returns 404 for a model, check current Gemini API model documentation and available models before changing credentials or treating the key as invalid.
