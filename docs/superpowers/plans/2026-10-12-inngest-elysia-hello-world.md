# Inngest Elysia Hello World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the local pipeline loop by publishing one Inngest event from a locally-run Elysia API and observing the run in the local Inngest UI.

**Architecture:** Infra-only containers via Podman Compose (Inngest dev server); Elysia + inngest-js runs on host Bun via `bun dev` scripts; no app code is containerized.

**Tech Stack:** Podman + podman-compose (Compose Spec), Bun (TypeScript), Elysia, inngest-js official SDK, asdf/mise for Bun pinning

**Spec:** `AGENTS.md` (Plan → Decision → Implement → Document loop) + `README.md` (PoC goal) + brainstorming conversation 2026-10-12 (Podman full, Elysia over Hono/Svelte API, Inngest over ZIO/Temporal/none, `bun dev` / `bun dev:setup` self-contained, no global binaries)

## Global Constraints

- FOSS only for local harness; no Docker Desktop dependency.
- As simple or simpler than docker-compose; no Helm charts / no K8s manifests for local dev.
- Everything except code under development is containerized; Elysia API runs on host Bun, not in a container.
- Bun environment self-defined: no global binary assumption; pinned via file + `bun dev` / `bun dev:setup` entrypoints.
- Every technology choice gets an ADR in `docs/decisions/` copied from `adr-template.md` with next free number and `status` set.
- Every feature updates `CHANGELOG.md` `[Unreleased]` and `README.md` if behavior/setup changed; README stays standard-readme compliant with matching ToC.
- Do not invent URLs (repo/issues/compare links); no git remote exists yet.
- Style: mostly functional TypeScript on Bun; logging as side effect allowed.

## Review Focus

- Inngest dev server reachable at `http://localhost:8288` but Elysia serve route returns 404 — expect webhook registration to succeed on first `podman compose up` + `bun dev`.
- Event sent via `inngest.send({name:"demo/hello.world"})` never appears in UI — expect function event name and trigger name to match exactly.
- Container can not reach host Elysia webhook — expect `host.containers.internal` (Podman) documented, not `localhost` inside container.
- `bun dev` works on author machine but fails on fresh clone — expect pinned Bun version + `bun install` to reproduce it.
- `podman compose up` works but `docker compose` / `nerdctl compose` file diverges — expect single canonical `compose.yaml` tested with `podman compose`.

---

### Task 1: ADR container harness Podman Compose

**Files:**
- Create: `docs/decisions/0001-container-harness-podman-compose.md`

**Interfaces:**
- Consumes: AGENTS.md ADR rules, brainstorming decision (full Podman, FOSS OCI simple, Rancher Desktop rejected for engine)
- Produces: Accepted harness name `Podman + podman-compose`, canonical file `compose.yaml`, infra-only rule relied on by Task 5

- [ ] **Step 1: Write ADR from template**

Copy `docs/decisions/adr-template.md` to `docs/decisions/0001-container-harness-podman-compose.md`, `status: accepted`, `date: 2026-10-12`, decision-makers: William Van Steen. Context: local env for Inngest + DBs, Elysia on host. Drivers: FOSS, Compose-simple, no Helm, OCI. Options: Podman + compose, Podman Quadlet, Rancher Desktop containerd/dockerd, kind/k3d/minikube. Outcome: Podman + Compose Spec because daemonless rootless native on Linux, single `compose.yaml`, Rancher does not support Podman engine (upstream not planned), Quadlet splits per-container files, K8s violates simplicity.

- [ ] **Step 2: Verify ADR links and format**

Run: `ls docs/decisions/0001* && grep -q "status: accepted" docs/decisions/0001-container-harness-podman-compose.md && echo OK`
Expected: PASS with OK

- [ ] **Step 3: Commit**

```bash
git add docs/decisions/0001-container-harness-podman-compose.md
git commit -m "docs: add ADR 0001 podman compose harness"
```

### Task 2: ADR web framework Elysia

**Files:**
- Create: `docs/decisions/0002-web-framework-elysia.md`

**Interfaces:**
- Consumes: Same template/rules
- Produces: Accepted framework `Elysia on Bun`, relied on by Task 6 for `src/index.ts`

- [ ] **Step 1: Write ADR from template**

Copy template to `docs/decisions/0002-web-framework-elysia.md`, `status: accepted`. Context: need typed webhook + JSON API for Inngest serve. Options: Elysia, Hono, SvelteKit API routes. Outcome: Elysia because preferred API ergonomics over Hono, Svelte/Next API routes frustrating for API management, Bun lock-in accepted (no longer a downside).

- [ ] **Step 2: Verify**

Run: `grep -q "status: accepted" docs/decisions/0002-web-framework-elysia.md && echo OK`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add docs/decisions/0002-web-framework-elysia.md
git commit -m "docs: add ADR 0002 elysia web framework"
```

### Task 3: ADR workflow engine Inngest

**Files:**
- Create: `docs/decisions/0003-workflow-engine-inngest.md`

**Interfaces:**
- Consumes: Same template/rules
- Produces: Accepted engine `Inngest + inngest-js`, event `demo/hello.world`, relied on by Task 6

- [ ] **Step 1: Write ADR from template**

Copy template to `docs/decisions/0003-workflow-engine-inngest.md`, `status: accepted`. Options: ZIO, Temporal, no workflow/worker, Inngest. Outcome: Inngest because simplest setup, familiar, good local + hobbyist support, no reason to skip worker system.

- [ ] **Step 2: Verify**

Run: `grep -q "status: accepted" docs/decisions/0003-workflow-engine-inngest.md && echo OK`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add docs/decisions/0003-workflow-engine-inngest.md
git commit -m "docs: add ADR 0003 inngest workflow engine"
```

### Task 4: ADR Bun version manager and bun scripts contract

**Files:**
- Create: `docs/decisions/0004-bun-version-and-scripts.md`

**Interfaces:**
- Consumes: Bun OOTB finding (`.bun-version` / `packageManager` convention only, no auto-switch like UV)
- Produces: Pin files (`.tool-versions` + `packageManager` + `.bun-version` same exact version) and script names `bun run dev`, `bun run dev:setup` relied on by Task 5 and Task 6

- [ ] **Step 1: Write ADR from template**

Copy template to `docs/decisions/0004-bun-version-and-scripts.md`, `status: accepted`. Options: Bun OOTB only, asdf + asdf-bun, mise. Outcome: asdf-compatible manager (mise preferred, asdf acceptable) because Bun does not enforce versions like UV; `setup-bun` / Renovate read the files but local switch needs manager. Contract: `bun run dev:setup` = `podman compose up -d`; `bun run dev` = ensure infra then `bun --hot src/index.ts`. No global `bun` / `podman-compose` version assumed.

- [ ] **Step 2: Verify**

Run: `grep -q "status: accepted" docs/decisions/0004-bun-version-and-scripts.md && echo OK`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add docs/decisions/0004-bun-version-and-scripts.md
git commit -m "docs: add ADR 0004 bun version and scripts"
```

### Task 5: Podman infra plus Bun project scaffold

**Files:**
- Create: `compose.yaml`
- Create: `package.json`
- Create: `.tool-versions`
- Create: `.bun-version`
- Modify: `CHANGELOG.md`
- Test: `podman compose config`

**Interfaces:**
- Consumes: Task 1 harness (`compose.yaml` canonical), Task 4 script contract + pin version
- Produces: `http://localhost:8288` Inngest UI up via `bun run dev:setup`; `bun install` reproducible; consumed by Task 6 (`src/index.ts` expects Inngest at 8288)

- [ ] **Step 1: Write failing verification (infra down)**

Run: `podman compose -f compose.yaml config`
Expected: FAIL with missing file (before scaffold exists)

- [ ] **Step 2: Implement `compose.yaml` with `inngest` service in `compose.yaml`**

Single service `inngest` from `inngest/inngest:latest`, command `inngest dev -u http://host.containers.internal:3000/api/inngest --no-discovery --port 8288` (adjust only if dev-server flag changed; keep host access via `host.containers.internal`), `ports: ["8288:8288"]`. No app service.

- [ ] **Step 3: Implement `package.json`, `.tool-versions`, `.bun-version` in repo root**

`package.json` with `name: bp-th-contract-features`, `type: module`, `packageManager: bun@<exact-same-as-dotfiles>` (implementer picks latest stable at execution, e.g. `1.3.x`, and uses same in all three files), `scripts: { "dev:setup": "podman compose up -d", "dev": "podman compose up -d && bun --hot src/index.ts" }`, deps `elysia`, `inngest`. `.tool-versions` line `bun <same>`. `.bun-version` line `<same>`.

- [ ] **Step 4: Run verification to pass**

Run: `bun install && podman compose config && bun run dev:setup && curl -s -o /dev/null -w "%{http_code}" http://localhost:8288`
Expected: PASS, config prints, final code 200, UI reachable; `podman compose ps` shows inngest running

- [ ] **Step 5: Update CHANGELOG and commit**

Add under `[Unreleased] Added`: Podman harness + Bun scaffold. Then:

```bash
git add compose.yaml package.json .tool-versions .bun-version CHANGELOG.md bun.lock
git commit -m "feat: add podman inngest infra and bun scaffold"
```

### Task 6: Elysia plus Inngest hello world

**Files:**
- Create: `src/index.ts`
- Create: `src/inngest.ts`
- Create: `src/functions/hello.ts`
- Create: `src/send.ts`
- Test: manual `curl` + UI check (no test runner yet)

**Interfaces:**
- Consumes: Task 2 Elysia, Task 3 Inngest event `demo/hello.world`, Task 5 infra (`localhost:8288`, `localhost:3000`)
- Produces: `GET /` health, `POST /api/inngest` serve handler, `bun run src/send.ts` publishes event, run visible in UI; consumed by Task 7 docs

- [ ] **Step 1: Verify failing (no serve route)**

Run: `bun --hot src/index.ts & sleep 2; curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/inngest; kill %1`
Expected: FAIL (no file / non-200)

- [ ] **Step 2: Implement `src/inngest.ts` exporting `const inngest = new Inngest({ id: "contract-features" })` in `src/inngest.ts`**

Use official `inngest` package only.

- [ ] **Step 3: Implement `export const helloWorld` via `inngest.createFunction({ id: "hello-world" }, { event: "demo/hello.world" }, async ({ event, step }) => {...})` in `src/functions/hello.ts`**

Body: single `step.run("say-hello", ...)` returning `{ message: "Hello " + (event.data?.name ?? "world") }`, plus `console.log` allowed.

- [ ] **Step 4: Implement Elysia `src/index.ts` listening on `3000` with `GET /` and Inngest serve at `/api/inngest` in `src/index.ts`**

Wire `serve({ client: inngest, functions: [helloWorld] })` via official adapter that works with Elysia/Bun (verify against installed `inngest` version docs at execution; prefer `inngest/bun` if present else Elysia-compatible handler). `GET /` returns `{ ok: true }`.

- [ ] **Step 5: Implement `src/send.ts` calling `inngest.send({ name: "demo/hello.world", data: { name: "local" } })` in `src/send.ts`**

- [ ] **Step 6: Run end-to-end verification**

Run: `bun run dev:setup && bun --hot src/index.ts & sleep 3; curl -s http://localhost:3000/; bun run src/send.ts; sleep 3; curl -s http://localhost:8288 | head -c 200`
Expected: PASS — `/` returns ok, send exits 0, Inngest UI HTML reachable, run for `hello-world` visible at `http://localhost:8288` (manual UI check: Functions tab lists hello-world, Runs tab shows one completed run)

- [ ] **Step 7: Commit**

```bash
git add src/index.ts src/inngest.ts src/functions/hello.ts src/send.ts package.json
git commit -m "feat: add elysia inngest hello world"
```

### Task 7: README and CHANGELOG for hello world

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: All prior tasks (final ports, scripts, ADRs)
- Produces: Reproducible `Install`/`Usage` docs (deferred until now per AGENTS.md)

- [ ] **Step 1: Check ToC mismatch (failing check)**

Run: `grep -c "Install\|Usage" README.md`
Expected: FAIL with 0 (sections missing before this task)

- [ ] **Step 2: Update `README.md` ToC + Install + Usage in `README.md`**

Add standard-readme `Install` (prereqs: Podman, podman-compose provider, Bun via mise/asdf) and `Usage` (`bun install`, `bun run dev:setup`, `bun run dev`, open `8288`, `bun run src/send.ts`). Keep ToC in sync with headings. Link the four new ADRs under Architecture Decisions. Short description still under 120 chars and matches `package.json`.

- [ ] **Step 3: Update `CHANGELOG.md` `[Unreleased] Added` in `CHANGELOG.md`**

Bullets for hello-world loop + ADRs 0001-0004.

- [ ] **Step 4: Verify docs**

Run: `grep -q "bun run dev" README.md && grep -q "hello" CHANGELOG.md && echo OK`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: document hello world setup and usage"
```
