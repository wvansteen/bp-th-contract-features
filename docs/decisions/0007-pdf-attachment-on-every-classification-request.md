---
status: accepted
date: 2026-10-18
decision-makers: William Van Steen
---

# PDF attachment on every classification request

## Context and Problem Statement

Smart feature prompts need the document's text, the documents are PDFs, and
OpenRouter can hand PDFs to models directly or parse them server-side. Capturing
a parse as stored text is not supported cleanly through the typed SDK (no
annotations field), and the project does not work around its tools.

## Decision Drivers

- No PDF extraction or OCR code in this repo
- How the PDF is digested, native file input or server-side parse, must not
  become repo code
- The narrowest path from a stored PDF to promptable content

## Considered Options

- Attach the PDF to every classification request and let OpenRouter decide how
  to digest it
- A separate OCR pass storing the OCR model's reproduction of the parse
- Box `extracted_text` representation
- A local PDF text extraction library

## Decision Outcome

Chosen option: "Attach the PDF to every classification request", because it
needs no text handling at all: OpenRouter hands the file to models with native
file input and parses it otherwise, so no engine knob is needed and the digest
stays correct as `SMART_FEATURE_MODEL` changes.

### Consequences

- Good, because there is no extraction code, no intermediate text
  representation, and no parser configuration to maintain.
- Good, because an integrated model reads scanned pages natively, which
  server-side text parsing (`cloudflare-ai`) could not do on real documents.
- Bad, because the document travels with every feature request, as input tokens
  or parse cost per request, and no text is stored.

### Confirmation

`src/openrouter/client.ts` sends the attachment as a `file` content part on
requests, configures no `file-parser` plugin, and no source file parses PDFs.
