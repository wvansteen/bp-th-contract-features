# Smart Feature Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify each ingested contract PDF against a configured list of smart
features with one OpenRouter call per feature, every call carrying the PDF as an
attachment, and store the PDF plus the results on the document row.

**Architecture:** The existing `process-file` Inngest function keeps exactly the
two durable step runs it has today (`describe-file`, `upsert`) and gains two
plain handler stages around them: a Box download before the upsert, and a
`Promise.all` over the smart feature list after it. Each classification request
carries `BASE_SMART_FEATURE_PROMPT` as a text part and the PDF as a file part;
OpenRouter parses the PDF with the engine named by `OCR_MODEL` (`mistral-ocr` or
`cloudflare-ai`) before the model sees it. The `documents` table gains
`document` (bytea) and `smart_features` (jsonb).

**Tech Stack:** Bun 1.2.23, TypeScript strict with `noUncheckedIndexedAccess`,
Inngest 4.x, `@openrouter/sdk` (official, latest 1.4.x), `box-node-sdk` 10.18.0,
Drizzle ORM + postgres.js, Elysia, `bun:test`.

**Spec:**
`docs/superpowers/specs/2026-10-18-smart-feature-classification-design.md`

## Global Constraints

- Lint locks (errors): no `let`/`var`, no assignment to variables, parameters,
  or object properties, no `for`/`while`/`do` loops, no `any` including type
  assertions, no `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, or `!`.
- Dependency injection: no env reads and no low-level client construction
  outside the `src/deps.ts` factories; capabilities are passed as parameters.
- No new Inngest `steps.run` calls, functions, or events. The handler keeps its
  existing `describe-file` and `upsert` step runs; everything new is plain code
  in the same run.
- No em dashes anywhere: prose, comments, commit messages. Use commas, colons,
  parentheses, or a period.
- `verbatimModuleSyntax` is on: type-only imports use `import type`.
- Scope: PDFs only, narrowest change, no CI, no speculative generality.
- No automated integration tests; the repo is not set up for them. The only
  end-to-end check is the manual smoke run in Task 5.
- Commands: `bun run typecheck`, `bun run lint`, `bun test`,
  `bun run format:check`; migrations via `bun run db:generate` then
  `mise run db:migrate`.
- Integration: work on the `feature/smart-features` branch created before the
  first commit, pushed to `origin` with a PR against `main`, one commit per task
  and one commit per review round. Never push to `main`.
- Docs: README stays standard-readme compliant; CHANGELOG bullets under
  `[Unreleased]` are short and user-facing.

## Review Focus

1. A Box download response of 202 ("not ready yet") has an empty body and
   `response.ok === true`, so a naive success check would store an empty PDF.
   Only status 200 is success. Pinned by `fileBytes` tests in Task 3
   (`rejects when the file is not ready yet`).
2. A non-PDF file must leave no trace: no database record, no download, no model
   call, and the run completes cleanly rather than failing. Pinned by
   `skips non-PDF files without writing a record` (Task 5).
3. One failed feature call must fail the run before the `smart_features` write,
   so a partial map is never written; the row then keeps the PDF and nothing
   else. Pinned by `rejects when any feature call fails` (Task 2) and
   `does not write smart features when classification fails` (Task 5).
4. Ingest is at-least-once: a re-run must replace `document` and
   `smart_features` wholesale, never merge or skip, and no write may leave a
   partial map on the row. Pinned by
   `downloads the file and stores the smart feature results` (Task 5), whose
   store rejects rows it considers partial, plus the `onConflictDoUpdate` set in
   Task 4.
5. `GET /contracts` must not serialize PDF bytes. Pinned by the
   `StoredDocumentSummary` return type of `DocumentStore.listAll` (Task 4); this
   repo has no database tests.

---

### Task 1: ADRs, OpenRouter client, and configuration

**Files:**

- Create: `docs/decisions/0007-openrouter-client-sdk.md`
- Create:
  `docs/decisions/0008-pdf-attachment-on-every-classification-request.md`
- Create: `src/openrouter/client.ts`
- Modify: `package.json`, `bun.lock` (dependency install)
- Modify: `src/config/env.ts`
- Modify: `src/deps.ts`
- Modify: `.env.example`
- Modify: `README.md` (Install env vars)

**Interfaces:**

- Consumes: nothing.
- Produces: `src/openrouter/client.ts` exports
  - `type CompletionInput = { model: string; prompt: string; attachment?: { filename: string; bytes: Uint8Array } }`
  - `type OpenRouterClientPort = { complete(input: CompletionInput): Promise<string> }`
  - `createOpenRouterClient(args: { apiKey: string; pdfEngine: string }): OpenRouterClientPort`
- Produces: `Env` in `src/config/env.ts` gains `openRouterApiKey: string` (from
  `OPENROUTER_API_KEY`), `ocrModel: string` (from `OCR_MODEL`), and
  `smartFeatureModel: string` (from `SMART_FEATURE_MODEL`).
- Produces: `src/deps.ts` exports `openRouterClient: OpenRouterClientPort`,
  built with `pdfEngine: env.ocrModel`.

There is no unit test for `createOpenRouterClient`. It is thin glue to
`@openrouter/sdk`, same status as `createBoxClient`, and the request and
response shapes are pinned by the SDK's generated types and `bun run typecheck`.

- [ ] **Step 1: Write ADR 0007**

Copy `docs/decisions/adr-template.md` to
`docs/decisions/0007-openrouter-client-sdk.md` and fill it in at the leanness
`AGENTS.md` requires (two to three sentences of context, in-scope drivers and
options only, one-line why, terse consequences, one-line confirmation):

- `status: accepted`, `date: 2026-10-18`, `decision-makers: William Van Steen`.
- Context: the pipeline calls OpenRouter chat completions for smart feature
  classification; the LLM stack is undecided, so the client choice is open.
- Options: official `@openrouter/sdk`; plain `fetch` against
  `POST /api/v1/chat/completions`; OpenAI SDK pointed at OpenRouter.
- Outcome: `@openrouter/sdk`, because it is the vendor SDK and its generated
  types cover the file content part and the file-parser plugin these requests
  need.
- Confirmation: `src/openrouter/client.ts` imports `@openrouter/sdk` and no file
  under `src/` calls `openrouter.ai` over `fetch`.

- [ ] **Step 2: Write ADR 0008**

`docs/decisions/0008-pdf-attachment-on-every-classification-request.md`, same
format:

- Context: smart feature prompts need the document's text, the documents are
  PDFs, and OpenRouter parses PDFs server-side for any model. Capturing that
  parse as stored text is not supported cleanly through the typed SDK (no
  annotations field), and the project does not work around its tools.
- Options: attach the PDF to every classification request and let OpenRouter
  parse it, with the engine configurable; a separate OCR pass storing the OCR
  model's reproduction of the parse; Box `extracted_text` representation; a
  local PDF text extraction library.
- Outcome: attach on every request, because it needs no text handling at all and
  the engine knob lets `mistral-ocr` and `cloudflare-ai` be compared on real
  documents.
- Consequences: good because there is no extraction code and no intermediate
  text representation; bad because the parse runs once per feature request
  (`mistral-ocr` about $2 per 1,000 pages per request) and no text is stored.
- Confirmation: `src/openrouter/client.ts` adds
  `plugins: [{ id: "file-parser", pdf: { engine } }]` to requests carrying an
  attachment, and no source file parses PDFs.

- [ ] **Step 3: Install the SDK**

Run: `bun add @openrouter/sdk` Expected: `package.json` dependencies list
`@openrouter/sdk`, `bun run typecheck` passes.

- [ ] **Step 4: Add the environment variables**

In `src/config/env.ts`, add `openRouterApiKey: string`, `ocrModel: string`, and
`smartFeatureModel: string` to `Env`, read from `OPENROUTER_API_KEY`,
`OCR_MODEL`, and `SMART_FEATURE_MODEL`, and throw the same kind of "is required"
errors the Box vars throw when any is missing.

Run: `bun run typecheck` Expected: PASS.

- [ ] **Step 5: Document the variables in `.env.example`**

Append to `.env.example`, matching the existing comment style:

```
# OpenRouter API key used for smart feature classification.
OPENROUTER_API_KEY=

# OpenRouter model slug used to classify smart features.
SMART_FEATURE_MODEL=openai/gpt-5-nano

# OpenRouter PDF parser engine used on every request that carries a PDF.
# "native" hands the PDF to models that read it themselves; "mistral-ocr" and
# "cloudflare-ai" parse it first ("mistral-ocr" costs about $2 per 1,000 pages,
# "cloudflare-ai" is free).
OCR_MODEL=native
```

- [ ] **Step 6: Implement `src/openrouter/client.ts`**

`createOpenRouterClient` builds `new OpenRouter({ apiKey })` (imported from
`@openrouter/sdk`) and returns `OpenRouterClientPort`. `complete` sends one
non-streaming chat completion and returns the message text. The call shape, from
the SDK's generated types:

```ts
const completion = await client.chat.send({
  chatRequest: {
    model,
    temperature: 0,
    reasoning: { effort: "none" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          // when input.attachment is set, append the file part and the parser plugin:
          {
            type: "file",
            file: {
              filename,
              fileData: `data:application/pdf;base64,${base64}`,
            },
          },
        ],
      },
    ],
    plugins: [{ id: "file-parser", pdf: { engine: pdfEngine } }],
  },
});
```

When `attachment` is unset, the content array holds only the text part and
`plugins` is omitted. When it is set, the PDF is parsed with the configured
engine before the model sees it. Every request pins `temperature: 0` and
`reasoning: { effort: "none" }` for deterministic extraction. The response is
the union `ChatResult | EventStream<ChatStreamChunk>`; narrow with
`if (!("choices" in completion)) throw ...`. The reply text is the message
content as-is when it is a string; when it is an array of content items,
concatenate the `text` items (Review answer: strings as-is, arrays joined).
Base64 with `Buffer.from(bytes).toString("base64")`.

Run: `bun run typecheck && bun run lint` Expected: PASS. If the installed types
reject the call shape, adapt to them; they are the source of truth.

- [ ] **Step 7: Wire `openRouterClient` in `src/deps.ts`**

`export const openRouterClient = createOpenRouterClient({ apiKey: env.openRouterApiKey, pdfEngine: env.ocrModel });`
alongside the other clients.

- [ ] **Step 8: README env line**

In the Install section, change the `.env` sentence to cover `BOX_APP_TOKEN`,
`BOX_FOLDER_ID`, `OPENROUTER_API_KEY`, `OCR_MODEL`, and `SMART_FEATURE_MODEL`.

- [ ] **Step 9: Verify and commit**

Run: `bun run format:check && bun run lint && bun run typecheck && bun test`
Expected: PASS.

```bash
git add docs/decisions/0007-openrouter-client-sdk.md docs/decisions/0008-pdf-attachment-on-every-classification-request.md package.json bun.lock src/openrouter/client.ts src/config/env.ts src/deps.ts .env.example README.md
git commit -m "feat: OpenRouter client behind a port, with env configuration"
```

---

### Task 2: Smart feature prompts and classifier

**Files:**

- Create: `src/smart-features/prompts.ts`
- Create: `src/smart-features/features.ts`
- Create: `src/smart-features/classify.ts`
- Test: `src/smart-features/prompts.test.ts`
- Test: `src/smart-features/classify.test.ts`
- Modify: `src/deps.ts`

**Interfaces:**

- Consumes: `OpenRouterClientPort`, `CompletionInput` (Task 1).
- Produces:
  - `BASE_SMART_FEATURE_PROMPT(input: { filename: string; featurePrompt: string }): string`
    in `src/smart-features/prompts.ts`
  - `type SmartFeature = { name: string; prompt: string }` and
    `const SMART_FEATURES: readonly SmartFeature[]` (empty array) in
    `src/smart-features/features.ts`
  - `type ClassifySmartFeatures = (input: { filename: string; document: Uint8Array }) => Promise<Record<string, string>>`
  - `createSmartFeatureClassifier(args: { client: OpenRouterClientPort; model: string; features: readonly SmartFeature[] }): ClassifySmartFeatures`
    in `src/smart-features/classify.ts`
  - `src/deps.ts` exports `smartFeatureClassifier: ClassifySmartFeatures`

- [ ] **Step 1: Write the failing prompt test**

`src/smart-features/prompts.test.ts`:

````ts
import { describe, expect, it } from "bun:test";
import { BASE_SMART_FEATURE_PROMPT } from "./prompts";

describe("BASE_SMART_FEATURE_PROMPT", () => {
  it("interpolates the file name and the feature prompt", () => {
    const prompt = BASE_SMART_FEATURE_PROMPT({
      filename: "20220920103554.pdf",
      featurePrompt: "payment terms",
    });

    expect(prompt).toBe(
      "Your job is to classify features from Documents. Your only output should ever be the exact text of the document matching your `Smart Feature Prompt`. What you will do is:\n" +
        "Use this document ```20220920103554.pdf``` attached to this message to identify the part of the document which is most closely described by this ```payment terms``` Include the matching part of the source document and no other.",
    );
  });
});
````

- [ ] **Step 2: Write the failing classifier tests**

`src/smart-features/classify.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { createSmartFeatureClassifier } from "./classify";
import { BASE_SMART_FEATURE_PROMPT } from "./prompts";

const document = new Uint8Array([1, 2, 3, 4, 5]);
const filename = "20220920103554.pdf";

describe("createSmartFeatureClassifier", () => {
  it("returns one entry per feature keyed by name", async () => {
    const classify = createSmartFeatureClassifier({
      client: { complete: ({ prompt }) => Promise.resolve(prompt) },
      model: "deepseek/deepseek-v4.1-flash-1017",
      features: [
        { name: "Payment Terms", prompt: "payment terms" },
        { name: "Termination", prompt: "termination clause" },
      ],
    });

    expect(await classify({ filename, document })).toEqual({
      "Payment Terms": BASE_SMART_FEATURE_PROMPT({
        filename,
        featurePrompt: "payment terms",
      }),
      Termination: BASE_SMART_FEATURE_PROMPT({
        filename,
        featurePrompt: "termination clause",
      }),
    });
  });

  it("sends the document bytes and file name with every call", async () => {
    const classify = createSmartFeatureClassifier({
      client: {
        complete: ({ attachment }) =>
          Promise.resolve(
            [attachment?.filename ?? "", attachment?.bytes.length ?? 0].join(
              ":",
            ),
          ),
      },
      model: "deepseek/deepseek-v4.1-flash-1017",
      features: [{ name: "Payment Terms", prompt: "payment terms" }],
    });

    expect(await classify({ filename, document })).toEqual({
      "Payment Terms": "20220920103554.pdf:5",
    });
  });

  it("returns an empty object when no features are configured", async () => {
    const classify = createSmartFeatureClassifier({
      client: { complete: () => Promise.reject(new Error("not used")) },
      model: "deepseek/deepseek-v4.1-flash-1017",
      features: [],
    });

    expect(await classify({ filename, document })).toEqual({});
  });

  it("stores an empty model reply verbatim", async () => {
    const classify = createSmartFeatureClassifier({
      client: { complete: () => Promise.resolve("") },
      model: "deepseek/deepseek-v4.1-flash-1017",
      features: [{ name: "Termination", prompt: "termination clause" }],
    });

    expect(await classify({ filename, document })).toEqual({ Termination: "" });
  });

  it("rejects when any feature call fails", async () => {
    const classify = createSmartFeatureClassifier({
      client: {
        complete: ({ prompt }) =>
          prompt.includes("boom")
            ? Promise.reject(new Error("model unavailable"))
            : Promise.resolve(prompt),
      },
      model: "deepseek/deepseek-v4.1-flash-1017",
      features: [
        { name: "Payment Terms", prompt: "boom" },
        { name: "Termination", prompt: "termination clause" },
      ],
    });

    await expect(classify({ filename, document })).rejects.toThrow(
      "model unavailable",
    );
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun test src/smart-features` Expected: FAIL, modules `./prompts` and
`./classify` not found.

- [ ] **Step 4: Implement the prompt module**

`src/smart-features/prompts.ts` holds exactly the copy the test asserts. The
document arrives as an attachment, so the copy references the attached file by
name:

```ts
export const BASE_SMART_FEATURE_PROMPT = (input: {
  filename: string;
  featurePrompt: string;
}): string =>
  `Your job is to classify features from Documents. Your only output should ever be the exact text of the document matching your \`Smart Feature Prompt\`. What you will do is:
Use this document \`\`\`${input.filename}\`\`\` attached to this message to identify the part of the document which is most closely described by this \`\`\`${input.featurePrompt}\`\`\` Include the matching part of the source document and no other.`;
```

- [ ] **Step 5: Implement the feature list and the classifier**

`src/smart-features/features.ts`:

```ts
export type SmartFeature = { name: string; prompt: string };

// Names must be unique. If there are duplicates then the last wins.
export const SMART_FEATURES: readonly SmartFeature[] = [];
```

`src/smart-features/classify.ts`: `createSmartFeatureClassifier` returns a
`ClassifySmartFeatures` that builds one `client.complete` call per feature with
`Promise.all` over `features.map(...)`, each prompt coming from
`BASE_SMART_FEATURE_PROMPT({ filename, featurePrompt: feature.prompt })`, each
request carrying `attachment: { filename, bytes: document }`, and folds the
results into one object with `Object.fromEntries` keyed by `feature.name`. No
`for` loops, no accumulation.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun test src/smart-features` Expected: PASS, 5 tests.

- [ ] **Step 7: Wire `smartFeatureClassifier` in `src/deps.ts`**

```ts
export const smartFeatureClassifier = createSmartFeatureClassifier({
  client: openRouterClient,
  model: env.smartFeatureModel,
  features: SMART_FEATURES,
});
```

- [ ] **Step 8: Verify and commit**

Run: `bun run format:check && bun run lint && bun run typecheck && bun test`
Expected: PASS.

```bash
git add src/smart-features src/deps.ts
git commit -m "feat: smart feature prompts and parallel classifier"
```

---

### Task 3: Box file download

**Files:**

- Create: `src/box/download.ts`
- Test: `src/box/download.test.ts`
- Modify: `src/box/client.ts`
- Modify: `src/functions/list-files.test.ts`,
  `src/functions/process-file.test.ts` (fakes)

**Interfaces:**

- Consumes: nothing.
- Produces:
  `fileBytes(args: { url: string; fetchResponse: (url: string) => Promise<Response> }): Promise<Uint8Array>`
  in `src/box/download.ts`.
- Produces: `BoxClientPort` gains
  `downloadFile(args: { fileId: string }): Promise<Uint8Array>`;
  `createBoxClient` implements it.

- [ ] **Step 1: Write the failing tests**

`src/box/download.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { fileBytes } from "./download";

const url = "https://api.box.com/2.0/files/123/content";

describe("fileBytes", () => {
  it("returns the downloaded bytes", async () => {
    const bytes = await fileBytes({
      url,
      fetchResponse: () =>
        Promise.resolve(new Response(new Uint8Array([37, 80, 68, 70]))),
    });

    expect(bytes).toEqual(new Uint8Array([37, 80, 68, 70]));
  });

  it("rejects when the file is not ready yet", async () => {
    await expect(
      fileBytes({
        url,
        fetchResponse: () =>
          Promise.resolve(new Response(null, { status: 202 })),
      }),
    ).rejects.toThrow("status 202");
  });

  it("rejects on an error status", async () => {
    await expect(
      fileBytes({
        url,
        fetchResponse: () =>
          Promise.resolve(new Response("forbidden", { status: 403 })),
      }),
    ).rejects.toThrow("status 403");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/box/download.test.ts` Expected: FAIL, module `./download` not
found.

- [ ] **Step 3: Implement `fileBytes` in `src/box/download.ts`**

Signature as in the Interfaces block. Only status 200 counts as success (Review
Focus 1: a 202 is `ok` but carries an empty body), anything else throws
`Box download at ${url} returned status ${response.status}`; success returns
`new Uint8Array(await response.arrayBuffer())`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/box/download.test.ts` Expected: PASS, 3 tests.

- [ ] **Step 5: Implement `downloadFile` on the Box client**

`src/box/client.ts`, inside `createBoxClient`, matching the documented
`GET /files/{id}/content` behavior (302 to a pre-signed `dl.boxcloud.com` URL):

```ts
async downloadFile({ fileId }) {
  const url = await sdk.downloads.getDownloadFileUrl(fileId);
  return fileBytes({
    url,
    fetchResponse: (downloadUrl) =>
      fetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } }),
  });
},
```

`fetch` follows the redirect; the pre-signed target URL works with or without
the auth header.

- [ ] **Step 6: Update the `BoxClientPort` fakes in existing tests**

Every fake object typed as `BoxClientPort` in `src/functions/list-files.test.ts`
and `src/functions/process-file.test.ts` gains
`downloadFile: () => Promise.reject(new Error("not used"))`, matching the
existing fakes' style for unused methods.

- [ ] **Step 7: Verify and commit**

Run: `bun run format:check && bun run lint && bun run typecheck && bun test`
Expected: PASS.

```bash
git add src/box src/functions/list-files.test.ts src/functions/process-file.test.ts
git commit -m "feat: download raw file bytes from Box"
```

---

### Task 4: Schema, migration, and document store

**Files:**

- Modify: `src/db/schema.ts`
- Modify: `src/db/document-store.ts`
- Create: `drizzle/<generated>.sql` and `drizzle/meta/*` (generated by
  `bun run db:generate`)

**Interfaces:**

- Consumes: nothing.
- Produces: `documents` gains `document bytea NOT NULL DEFAULT '\x'::bytea` and
  `smart_features jsonb NOT NULL DEFAULT '{}'`.
- Produces:
  `StoredDocument = { documentId: string; metadata: Record<string, unknown>; document: Uint8Array; smartFeatures: Record<string, string> }`
  and
  `StoredDocumentSummary = Pick<StoredDocument, "documentId" | "metadata" | "smartFeatures">`.
- Produces: `DocumentStore.upsert(row: StoredDocument)` writes all four columns
  with `onConflictDoUpdate` setting all of them;
  `DocumentStore.listAll(): Promise<StoredDocumentSummary[]>` selects
  `document_id`, `metadata`, `smart_features` only.

- [ ] **Step 1: Add the columns to `src/db/schema.ts`**

```ts
import { pgTable, text, jsonb, bytea } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const documents = pgTable("documents", {
  document_id: text("document_id").primaryKey(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
  document: bytea("document")
    .notNull()
    .default(sql`'\x'::bytea`),
  smart_features: jsonb("smart_features")
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
});
```

`document` holds the raw PDF, as decided in the spec. There is no text column:
the design sends the PDF on every request instead of storing extracted text.

- [ ] **Step 2: Generate the migration**

Run: `bun run db:generate` Expected: a new file under `drizzle/` whose SQL
contains `ALTER TABLE "documents" ADD COLUMN "document" bytea` and
`ADD COLUMN "smart_features" jsonb`. Read the generated SQL before continuing.

- [ ] **Step 3: Extend `src/db/document-store.ts`**

Types and queries per the Interfaces block. `upsert` inserts the full row and
sets every column on conflict; `listAll` selects the three non-binary columns
and maps them to `StoredDocumentSummary`. Keep the existing mapping style.

- [ ] **Step 4: Apply the migration to the local stack**

Run: `mise run db:migrate` Expected: the migration applies without error.

- [ ] **Step 5: Verify and commit**

Run: `bun run format:check && bun run lint && bun run typecheck && bun test`
Expected: PASS.

```bash
git add src/db drizzle
git commit -m "feat: store document bytes and smart features on documents"
```

---

### Task 5: Process-file wiring, tests, and docs

**Files:**

- Modify: `src/functions/process-file.ts`
- Test: `src/functions/process-file.test.ts`
- Modify: `src/inngest.ts`
- Modify: `CHANGELOG.md`
- Modify: `README.md`

**Interfaces:**

- Consumes: `ClassifySmartFeatures` (Task 2), `BoxClientPort.downloadFile` (Task
  3), `StoredDocument` and `StoredDocumentSummary` (Task 4).
- Produces:
  `processFileHandler(box: BoxClientPort, steps: ProcessFileSteps, store: DocumentStore, classify: ClassifySmartFeatures, params: { fileId: string }): Promise<ProcessFileResult>`
  with
  - `type SkippedDocument = { documentId: string; skipped: "not-a-pdf" }`
  - `type ProcessedDocument = { documentId: string; metadata: Record<string, unknown>; smartFeatures: Record<string, string>; upserted: { documentId: string; metadata: Record<string, unknown> } }`
  - `type ProcessFileResult = SkippedDocument | ProcessedDocument`

The `upserted` field is what the existing `steps.run("upsert", ...)` returns
today: the id and metadata it wrote. The PDF bytes never cross an Inngest step
boundary, so nothing large is memoized or stored in run state. A skip returns
`SkippedDocument` before any download or write, so a non-PDF never becomes a
row.

- [ ] **Step 1: Write the failing tests**

Add to `src/functions/process-file.test.ts`, alongside the existing tests.
`boxWithContent(file: Record<string, unknown>, bytes: Uint8Array): BoxClientPort`
is a new helper: `describeFile` resolves `file`, `downloadFile` resolves
`bytes`, `listFiles` rejects with "not used". The existing tests gain a
`classify` stub (`() => Promise.resolve({})`) alongside the `downloadFile` stubs
from Task 3, and any assertion that reads `result.metadata` becomes a
whole-object `toEqual`, since `ProcessFileResult` is now a union. The first
existing test, rewritten:

```ts
it("describes the file and upserts it", async () => {
  const result = await processFileHandler(
    boxWithContent(
      { id: "777", name: "contract.pdf", size: 5000 },
      new Uint8Array([1]),
    ),
    passthroughSteps,
    noopStore,
    () => Promise.resolve({}),
    { fileId: "123" },
  );

  expect(result).toEqual({
    documentId: "123",
    metadata: { id: "777", name: "contract.pdf", size: 5000 },
    smartFeatures: {},
    upserted: {
      documentId: "123",
      metadata: { id: "777", name: "contract.pdf", size: 5000 },
    },
  });
});
```

New tests:

```ts
const rowAllowed = (row: StoredDocument): boolean =>
  row.document.length === 3 &&
  (Object.keys(row.smartFeatures).length === 0
    ? true
    : row.smartFeatures["Payment Terms"] === "20220920103554.pdf:3");

const stagedStore: DocumentStore = {
  upsert: (row) =>
    rowAllowed(row)
      ? Promise.resolve(undefined)
      : Promise.reject(new Error("upsert received a partial row")),
  listAll: () => Promise.resolve([]),
};

it("downloads the file and stores the smart feature results", async () => {
  const result = await processFileHandler(
    boxWithContent(
      { id: "777", name: "20220920103554.pdf" },
      new Uint8Array([1, 2, 3]),
    ),
    passthroughSteps,
    stagedStore,
    ({ filename, document }) =>
      Promise.resolve({ "Payment Terms": `${filename}:${document.length}` }),
    { fileId: "123" },
  );

  expect(result.documentId).toBe("123");
  expect(result.smartFeatures).toEqual({
    "Payment Terms": "20220920103554.pdf:3",
  });
  expect(result.upserted.documentId).toBe("123");
});

it("stores the document even when no features are configured", async () => {
  const result = await processFileHandler(
    boxWithContent({ id: "777" }, new Uint8Array([1, 2, 3])),
    passthroughSteps,
    stagedStore,
    () => Promise.resolve({}),
    { fileId: "123" },
  );

  expect(result.smartFeatures).toEqual({});
});

it("does not write smart features when classification fails", async () => {
  const store: DocumentStore = {
    upsert: (row) =>
      Object.keys(row.smartFeatures).length === 0
        ? Promise.resolve(undefined)
        : Promise.reject(new Error("smart features must not be written")),
    listAll: () => Promise.resolve([]),
  };

  await expect(
    processFileHandler(
      boxWithContent({ id: "777" }, new Uint8Array([1, 2, 3])),
      passthroughSteps,
      store,
      () => Promise.reject(new Error("model unavailable")),
      { fileId: "123" },
    ),
  ).rejects.toThrow("model unavailable");
});

it("skips non-PDF files without writing a record", async () => {
  const store: DocumentStore = {
    upsert: () => Promise.reject(new Error("no record must be written")),
    listAll: () => Promise.resolve([]),
  };

  const result = await processFileHandler(
    boxWithContent({ id: "777", name: "notes.txt" }, new Uint8Array([1])),
    passthroughSteps,
    store,
    () => Promise.reject(new Error("classify must not run")),
    { fileId: "123" },
  );

  expect(result).toEqual({ documentId: "123", skipped: "not-a-pdf" });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/functions/process-file.test.ts` Expected: FAIL, the new tests
do not compile against the current handler signature.

- [ ] **Step 3: Implement the handler flow in `src/functions/process-file.ts`**

Keep `describe-file` and `upsert` as the only `steps.run` calls, unchanged in
name. Everything else is plain handler code in the same run (the agreed "all in
that one step"), so an Inngest retry re-runs the download and every
classification call.

```ts
const described = await steps.run("describe-file", () =>
  describeFile(box, params.fileId),
);
if (!isRecord(described)) {
  throw new Error(`Box returned an unexpected shape for file ${params.fileId}`);
}
const metadata = described;
const filename =
  typeof metadata.name === "string" ? metadata.name : params.fileId;

if (!filename.toLowerCase().endsWith(".pdf")) {
  console.warn(`Skipping non-PDF file ${params.fileId} (${filename})`);
  return { documentId: params.fileId, skipped: "not-a-pdf" };
}

const document = await box.downloadFile({ fileId: params.fileId });

const upserted = await steps.run("upsert", async () => {
  const written = { documentId: params.fileId, metadata };
  await store.upsert({ ...written, document, smartFeatures: {} });
  return written;
});
if (!isStoredDocument(upserted)) {
  throw new Error(
    `upsert did not return a stored document for ${params.fileId}`,
  );
}

const smartFeatures = await classify({ filename, document });
await store.upsert({
  documentId: params.fileId,
  metadata,
  document,
  smartFeatures,
});

return { documentId: params.fileId, metadata, smartFeatures, upserted };
```

The file type check is the file name suffix, case-insensitive (Box's `extension`
field exists too, but the name is what the attachment carries, so one source of
truth). A skip logs one warning (`console.warn`; logging is the repo's allowed
side effect) and returns before any download or write (Review Focus 2).
`isStoredDocument` stays exactly as it is today (it checks `documentId` and
`metadata`, which is what the upsert step returns). `ProcessFileResult` per the
Interfaces block. A failure in `downloadFile` or `classify` throws before its
write happens (Review Focus 3).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/functions/process-file.test.ts` Expected: PASS.

- [ ] **Step 5: Wire the classifier in `src/inngest.ts`**

`processFileHandler(boxClient, step, documentStore, smartFeatureClassifier, { fileId: readFileId(event.data) })`.
The function's own return value stays discarded, so no document bytes enter
Inngest run output.

- [ ] **Step 6: Docs**

- `CHANGELOG.md`, under `[Unreleased]` / `Added`: one bullet, user-facing, e.g.
  "Smart features: each processed document is classified against the configured
  smart feature prompts, with the document PDF sent to the model per feature;
  the results are stored on the document record and returned by
  `GET /contracts`."
- `README.md`: one sentence in Background that processing stores each document's
  PDF and classifies it against the smart features with one model call per
  feature; adjust the `GET /contracts` line under Usage to say it returns
  metadata and smart feature results.

- [ ] **Step 7: Verify and commit**

Run: `bun run format:check && bun run lint && bun run typecheck && bun test`
Expected: PASS, all suites green.

```bash
git add src/functions src/inngest.ts CHANGELOG.md README.md
git commit -m "feat: classify documents against smart features during processing"
```

- [ ] **Step 8: Smoke run one real document (manual, not a test)**

This is the only end-to-end check; there are no automated integration tests.
Copy the real `.env` values into the worktree (`BOX_APP_TOKEN`, `BOX_FOLDER_ID`,
`OPENROUTER_API_KEY`, `SMART_FEATURE_MODEL`, `OCR_MODEL=cloudflare-ai`), and add
one throwaway feature to `SMART_FEATURES`, for example
`{ name: "Payment Terms", prompt: "payment terms" }`, so the model path actually
executes. Do not commit the throwaway feature.

Start the stack in the background (`mise run dev`), then ingest exactly one
document:

```sh
curl -X POST http://localhost:<port>/process-contracts \
  -H "Content-Type: application/json" \
  -d '{"maxDocuments": 1}'
```

Wait for the `process-file` run to finish (the Inngest UI link is printed at
startup), then:

```sh
curl http://localhost:<port>/contracts
```

Expected: one document with its metadata and a `smart_features` object holding
`Payment Terms` with the model's matching document text as its value. Paste the
response into the implementer report, then revert the throwaway feature.

- [ ] **Step 9: Push the branch and open the pull request**

Run: `git push -u origin feature/smart-features`, then open a PR against `main`
with `gh pr create`. Every later review round gets its own commit and push.
