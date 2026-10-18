---
status: accepted
date: 2026-10-18
decision-makers: William Van Steen
---

# PDF attachment on every classification request

## Context and Problem Statement

Smart feature prompts need the document's text, the documents are PDFs, and
OpenRouter parses PDFs server-side for any model. Capturing that parse as stored
text is not supported cleanly through the typed SDK (no annotations field), and
the project does not work around its tools.

## Decision Drivers

- No PDF extraction or OCR code in this repo
- The parse engine must be comparable on real documents
- The narrowest path from a stored PDF to promptable text

## Considered Options

- Attach the PDF to every classification request and let OpenRouter parse it,
  with the engine configurable
- A separate OCR pass storing the OCR model's reproduction of the parse
- Box `extracted_text` representation
- A local PDF text extraction library

## Decision Outcome

Chosen option: "Attach the PDF to every classification request", because it
needs no text handling at all and the engine knob lets `mistral-ocr` and
`cloudflare-ai` be compared on real documents.

### Consequences

- Good, because there is no extraction code and no intermediate text
  representation.
- Bad, because the parse runs once per feature request (`mistral-ocr` about $2
  per 1,000 pages per request) and no text is stored.

### Confirmation

`src/openrouter/client.ts` adds
`plugins: [{ id: "file-parser", pdf: { engine } }]` to requests carrying an
attachment, and no source file parses PDFs.
