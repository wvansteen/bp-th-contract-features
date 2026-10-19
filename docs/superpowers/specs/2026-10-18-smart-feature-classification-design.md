# Smart Feature Classification Design

Date: 2026-10-18 Status: agreed in conversation. Flow revised three times on
2026-10-18. Final shape: no OCR pass; the PDF rides along on every
classification request and an integrated model reads it directly, so no separate
OCR concern remains.

## Intent

When a document is processed, classify it against a named list of smart
features. Each smart feature is a name plus a classifying prompt. For every
feature, one model call carries the document PDF and the base prompt, and the
model returns the part of the document that feature describes. The results land
on the document row in Postgres as a JSON object keyed by feature name. This
change is scaffolding only: the targeted list of smart features is decided later
and dropped into one seam.

## Goals

- A `SMART_FEATURES` list of `{ name, prompt }` in code, empty for now.
- `BASE_SMART_FEATURE_PROMPT` as an interpolated template, iterable on its own
  independently of the per-feature prompts.
- In the existing process-file step: one OpenRouter call per smart feature, in
  parallel (`Promise.all`), each carrying the PDF as a file attachment.
- The raw PDF stored as the `document` column and the results as
  `smart_features` jsonb on the `documents` table.
- `OPENROUTER_API_KEY` and `SMART_FEATURE_MODEL` as environment variables,
  listed in `.env.example`. `SMART_FEATURE_MODEL` holds a model slug and is
  expected to read the PDF itself.

## Non-goals

- The actual smart feature list.
- New pipeline steps, new Inngest functions, or new events.
- A separate OCR pass or an OCR text column. Capturing the parser's output as
  stored text is not supported cleanly through the tools (see premise checks),
  and the project does not work around its tools.
- Partial results, per-feature retry, or caching of model output.
- Any UI for the results.

## Constraints

- Everything happens in the existing process-file step for now.
- One failed call fails the whole step and Inngest retries the run.
- Document files are PDFs. Nothing else is handled.
- The repo's style locks hold: no `let`/`var`, no assignment, no loops, no
  `any`, no lint suppressions; env access and client construction only in
  `src/deps.ts` factories.

## The flow

Inside the existing process-file function, in order:

1. Describe the file in Box (the existing `steps.run("describe-file", ...)`).
2. Check the file type. If the file name does not end in `.pdf`, log a warning
   and stop: no download, no model call, no database record, run complete.
3. Download the PDF bytes from Box.
4. Write the row: metadata plus the PDF (the existing
   `steps.run("upsert", ...)`, extended with the `document` column). This is the
   "write it to Postgres as before" stage.
5. Smart feature calls: one OpenRouter call to `SMART_FEATURE_MODEL` per
   feature, in parallel (`Promise.all`). Each request carries
   `BASE_SMART_FEATURE_PROMPT` as a text part and the PDF as a file part, which
   the model reads directly; OpenRouter's default passes the file through to
   models with file input and parses it for models without.
6. Write the row again, now with `smart_features`.

Step 6 is a plain upsert in the handler, not an Inngest step run. The function
keeps exactly the two `steps.run` calls the code has today; nothing new is
added.

## Decided in conversation

1. **PDF on every request.** No separate OCR pass. Every classification request
   sends the PDF and OpenRouter parses it server-side. Accepted as easier even
   though it costs a parse per request.
2. **`OCR_MODEL` stays**, as the knob for testing cloudflare vs mistral. Those
   are the two PDF parser engines in the OpenRouter API (`cloudflare-ai`,
   `mistral-ocr`), configured per request on the `file-parser` plugin. The
   variable keeps its name by instruction; its values are engine ids, not model
   slugs.
3. **Step scope.** All of it runs in the existing process-file step. No new
   steps at this time.
4. **Failure behavior.** Any failure fails the step; Inngest retries the whole
   run.

### Second round (answered 2026-10-18)

- **Non-PDF files:** check the file type in the process step; if it is not a
  PDF, log a warning and skip it, meaning no database record at all. The check
  is the file name suffix, case-insensitive.
- **File sizes:** the documents are text PDFs under 20 pages, comfortably inside
  the inline attachment limit. No size guard.
- **No match in a feature:** store the model's reply verbatim, empty string
  included. Iterate later if that proves wrong.
- **Reply shape:** strings stored as-is; array-shaped content has its text items
  concatenated.
- **Throttling:** no special error mapping. Inngest configuration handles
  throttling; if OpenRouter rate limits become a problem, fix it then.
- **Duplicate feature names:** accepted by convention, documented with a comment
  above `SMART_FEATURES` ("Names must be unique. If there are duplicates then
  the last wins."), since the list is written in code.

### Third round (answered 2026-10-18)

- **Sampling:** `temperature: 0` on every request, with
  `reasoning: { effort: "none" }` so extraction replies land in `content`
  instead of a reasoning field.
- **End-to-end check:** one real document through the existing
  `POST /process-contracts` ingest endpoint with `{"maxDocuments": 1}`, run
  manually. No automated integration tests; the repo is not set up for them. The
  smoke run uses one throwaway feature so the model path executes, and the
  throwaway is not committed.
- **Re-processing spend:** left as is, always re-classify.
- **Defaults accepted (not overridden):** feature entries are `{ name, prompt }`
  only; truncated model replies are stored as-is; the skip warning is the only
  log line a run emits.

### Fourth round (2026-10-18)

- **Model:** `SMART_FEATURE_MODEL=openai/gpt-5-nano`, the cheapest slug on the
  board ($0.025/M in, $0.20/M out) with native file input. GPT-4.1 nano remains
  the only nano-class model that never reasons, at four times the input price.
- **`OCR_MODEL` retired.** Its original job (a separate OCR model) disappeared
  with the OCR pass, and an integrated model needs no parser knob: OpenRouter's
  default hands the PDF to models with file input and parses it otherwise. The
  cloudflare-vs-mistral comparison the knob existed for is answered by the smoke
  run: `cloudflare-ai` produced no text for a scanned contract, `mistral-ocr`
  read it, and native file input reads it without a parse charge. Re-adding the
  knob is one line if a future model lacks file input and the engine matters.

## Premise checks (verified 2026-10-18)

- There is no Mistral OCR model on OpenRouter (`mistral/mistral-ocr-latest`
  returns 404). Mistral OCR is the `file-parser` plugin's
  `pdf.engine: "mistral-ocr"`, billed at about $2 per 1,000 pages;
  `"cloudflare-ai"` converts PDFs to markdown for free. The typed SDK value is
  `PDFParserEngine = "mistral-ocr" | "cloudflare-ai" | "native"`.
- PDF parsing works on any model: when the model has no native file input,
  OpenRouter parses the file and passes the parsed results to it.
  `deepseek/deepseek-v4.1-flash-1017` has `input_modalities: ["text","image"]`.
- The parsed text is not reachable through `@openrouter/sdk`: the typed chat
  message (`ChatAssistantMessage`) has no `annotations` field, and the repo bans
  casts. That is why the earlier "OCR pass and store the OCR text" design is
  dropped rather than approximated.
- `box-node-sdk` 10.18.0 has no `getFileContent`. The documented download calls
  are `client.downloads.downloadFile(fileId)` (a stream) and
  `client.downloads.getDownloadFileUrl(fileId)`; the plan fetches that URL for
  the bytes. (`GET /files/{id}/content`: 302 to a pre-signed `dl.boxcloud.com`
  URL, 202 with `Retry-After` when the file is not ready.)
  (https://developer.box.com/reference/get-files-id-content/)

## Costs and consequences

- With an integrated model the PDF is read as input tokens rather than parsed:
  tens of thousands of tokens per request for a 20-page contract, fractions of a
  cent at gpt-5-nano rates. Models without file input get it parsed instead
  (`mistral-ocr` about $2 per 1,000 pages per feature request).
- A retry re-runs the download and every classification call, because nothing is
  wrapped in Inngest step runs and nothing is memoized.
- Scanned, image-only PDFs: the smoke run's scanned contract produced no text
  under `cloudflare-ai` and read fine under `mistral-ocr`; native file input
  reads scans directly, which is why the integrated model wins on this corpus.
- PDF-only scope: the attachment hard-codes `application/pdf`.
- Nothing text-like is stored, so downstream features that need document text
  must go through a model call.

## What is left to the builder

The plan in `docs/superpowers/plans/2026-10-18-smart-feature-classification.md`
carries the exact signatures, file layout, and tests. Still open after that:

- The targeted smart feature list, supplied later by the project owner.
- Which engine wins once real documents have been run through both.
- Tuning of `BASE_SMART_FEATURE_PROMPT` wording once real documents have been
  run through the pipeline.
