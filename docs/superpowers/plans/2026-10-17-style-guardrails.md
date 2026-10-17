# Style Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make violations of the project's functional style fail at tool-call
time via ESLint and TypeScript locks, gated by a husky pre-commit hook that
runs format, lint, typecheck and build.

**Architecture:** An `eslint.config.ts` holds three labelled sections: hard
locks, framework relaxations (non-lock rules only), and an extension tail.
`tsconfig.json` supplies the type information the type-aware locks need.
Prettier covers code, config and Markdown with `proseWrap: "preserve"`. All
four checks are read-only commands wired into `.husky/pre-commit` under
`set -e`.

**Tech Stack:** ESLint 10 (flat config), typescript-eslint,
eslint-plugin-functional, Prettier 3, eslint-config-prettier, husky 9,
TypeScript on Bun.

**Spec:** `docs/superpowers/specs/2026-10-17-style-guardrails-design.md`

## Global Constraints

- Every lock rule is `error`. Lint runs as `eslint . --max-warnings 0
--no-inline-config`. Warnings are not an enforcement mechanism.
- `proseWrap` is pinned to `"preserve"` and must not change.
- Lock rules never relax. The framework relaxations section may hold
  non-lock rules only.
- `no-console` stays `off` in every config.
- No em dashes in any file this plan creates or edits: prose, commits, docs,
  code comments.
- No `CHANGELOG.md` entry. Tooling and dev-environment changes are out of
  scope for the changelog per `AGENTS.md`.
- `docs/superpowers/specs/2026-10-17-style-guardrails-design.md` is
  currently untracked and must be committed.

## Review Focus

1. **An `eslint-disable` comment silently bypasses a lock.** An agent that
   can comment its way past a rule re-creates the failure the locks exist to
   stop. Pinned by Task 4, Step 3.
2. **An `as unknown as T` cast reintroduces `any` around the type system.**
   `ban-ts-comment` alone does not see it. Pinned by Task 4, Step 5.
3. **The pre-commit hook keeps going past a failing command.** A shell hook
   without `set -e` runs every line regardless, so the gate silently does
   nothing. Pinned by Task 5, Step 4.
4. **`bun run build` succeeds while the types are broken.** Bun's
   transpiler erases types without checking them, so a passing build proves
   nothing about type soundness. Pinned by Task 5, Step 5.
5. **`prettier --check` silently skips Markdown.** The design's whole reason
   for including Markdown is fenced code blocks in the docs. Pinned by Task
   3, Step 3.

---

### Task 1: Architecture Decision Records

**Files:**

- Create: `docs/decisions/0006-lint-and-format-toolchain.md`
- Create: `docs/decisions/0007-pre-commit-gate.md`

**Interfaces:**

- Consumes: the decision content of the spec's "Why ESLint and Prettier",
  "The Locks", "Escapes Are Banned In-File" and "Enforcement Layers"
  sections.
- Produces: two ADRs at `status: accepted`, numbered 0006 and 0007, following
  the shape of `docs/decisions/0004-bun-version-and-scripts.md`.

- [ ] **Step 1: Copy the ADR template twice**

Run: `cp docs/decisions/adr-template.md docs/decisions/0006-lint-and-format-toolchain.md`
and again for `0007-pre-commit-gate.md`.

- [ ] **Step 2: Fill in ADR 0006, "Lint and format toolchain"**

Keep it lean per `AGENTS.md`: two to three sentences of context, in-scope
drivers and options only, a one-line why, terse consequences, one-line
confirmation.

Context: the project needs style violations to fail at tool-call time, and
the locks are behavioural (no `let`, no assignment, no loops, no `any`).

Drivers: locks must be enforceable by an existing supported tool; the rule
set must be extensible.

Options: `eslint-plugin-functional` with Prettier; Biome; Oxlint.

Outcome: ESLint plus Prettier plus `eslint-plugin-functional`, because it is
the only option that ships the behavioural locks as supported rules and
lets more be added.

Confirmation: `eslint.config.ts` exists and `bun run lint` exits non-zero on
a file containing `let x = 1;`.

- [ ] **Step 3: Fill in ADR 0007, "Pre-commit gate"**

Context: the locks only help if a commit cannot be made without satisfying
them.

Drivers: the gate must reject rather than rewrite; a build that passes must
mean the types are sound.

Options: husky pre-commit running format, lint, typecheck and build;
lint-staged on staged files; no hook.

Outcome: husky 9 running all four under `set -e`, because lint-staged only
sees staged files and cannot cover a whole-project typecheck or build, and
because a hook that rewrites the working tree is itself a mutation.

Confirmation: `.husky/pre-commit` starts with `set -e` and a commit with a
deliberate `let` is rejected.

- [ ] **Step 4: Verify both ADRs match the template's section shape**

Run: `grep -c '^## ' docs/decisions/0006-lint-and-format-toolchain.md docs/decisions/0007-pre-commit-gate.md`
Expected: each file has at least `## Context and Problem Statement`, `##
Decision Drivers`, `## Considered Options`, `## Decision Outcome`,
`### Confirmation`.

- [ ] **Step 5: Commit**

```bash
git add docs/decisions/0006-lint-and-format-toolchain.md docs/decisions/0007-pre-commit-gate.md docs/superpowers/specs/2026-10-17-style-guardrails-design.md
git commit -m "docs: record lint toolchain and pre-commit gate decisions"
```

The untracked design spec is committed here so it travels with the work.

---

### Task 2: TypeScript Foundation

**Files:**

- Create: `tsconfig.json`
- Modify: `package.json` (devDependencies, `typecheck` script)

**Interfaces:**

- Produces: `bun run typecheck`, which runs `tsc --noEmit` and exits 0 on
  clean source. Tasks 3 and 4 rely on `tsconfig.json` existing for
  type-aware lint rules.

- [ ] **Step 1: Add the dependency and the script**

In `package.json`, add `"typecheck": "tsc --noEmit"` to `scripts` and
`"@types/bun"` and `"typescript"` to `devDependencies`. There are no
devDependencies today, so the block is new.

- [ ] **Step 2: Write `tsconfig.json`**

`strict: true` is required (Elysia requires it, and it switches on
`noImplicitAny`). Use `moduleResolution: "bundler"`, `module: "esnext"`,
`target: "es2021"`, `noEmit: true`, and `types: ["bun"]`. Include `src`.
Exact remaining options are the implementer's call, as long as
`noImplicitAny` is on.

- [ ] **Step 3: Install and typecheck**

Run: `bun install && bun run typecheck`
Expected: exit 0. If `tsc` reports errors in the four existing `src/` files,
fix them in the smallest way that compiles; do not restructure.

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json package.json bun.lock src
git commit -m "build: add strict tsconfig and typecheck script"
```

---

### Task 3: Prettier

**Files:**

- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Modify: `package.json` (`format`, `format:check` scripts)

**Interfaces:**

- Produces: `bun run format` and `bun run format:check`, covering code,
  config and Markdown. Task 5 wires `format:check` into the hook.

- [ ] **Step 1: Write `.prettierrc.json`**

One key is a decision and must appear exactly: `"proseWrap": "preserve"`.
Other option values are the implementer's call; Prettier's defaults are
fine.

- [ ] **Step 2: Write `.prettierignore` and the two scripts**

Ignore `dist/`, `bun.lock` and `node_modules/`. Add `"format": "prettier
--write ."` and `"format:check": "prettier --check ."` to `package.json`.

- [ ] **Step 3: Verify Markdown is actually checked (Review Focus 5)**

Write a fixture file `docs/tmp-prettier-probe.md` containing a ragged table
and a `__bold__` marker. Run `bun run format:check`.
Expected: FAIL naming `docs/tmp-prettier-probe.md`. If it passes, Markdown
is not in scope and the config is wrong.

Then run `bun run format`, re-run `bun run format:check`.
Expected: PASS, and the probe file now has a padded table and `**bold**`.
Delete the probe file afterwards.

- [ ] **Step 4: Format the repository**

Run: `bun run format`
Expected: `README.md`, `AGENTS.md`, `CHANGELOG.md`, the ADRs and
`docs/superpowers/**` are normalised. Line breaks inside paragraphs must not
move. If paragraphs are reflowing, `proseWrap` is wrong.

- [ ] **Step 5: Commit**

```bash
git add .prettierrc.json .prettierignore package.json
git add -A
git commit -m "build: add prettier scoped to code, config and markdown"
```

---

### Task 4: ESLint Locks

**Files:**

- Create: `eslint.config.ts`
- Modify: `package.json` (devDependencies, `lint` script)
- Modify: `src/inngest.ts`, `src/functions/hello.ts`, and any other `src/`
  file the locks flag

**Interfaces:**

- Consumes: `tsconfig.json` from Task 2, for type-aware rules.
- Produces: `bun run lint`, which exits non-zero on any lock violation.

- [ ] **Step 1: Add dependencies and the lint script**

Add `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-functional`,
`prettier`, `eslint-config-prettier` to `devDependencies`. Add `"lint":
"eslint . --max-warnings 0 --no-inline-config"` to `scripts`. Both CLI flags
are load-bearing; if `--no-inline-config` is unavailable in the resolved
ESLint version, stop and report rather than dropping it.

- [ ] **Step 2: Write `eslint.config.ts`**

Flat config, TypeScript, three labelled sections in this order: `// HARD
LOCKS`, `// FRAMEWORK RELAXATIONS (non-lock rules only)`, `// ADD NEW RULES
HERE`. Type-aware linting via `projectService: true` with
`tsconfigRootDir: import.meta.dirname`.

Base on `tseslint.configs.recommendedTypeChecked`, then override in the hard
locks section. Every rule below is `"error"`:

- only `const`: `functional/no-let`, `no-var`, `prefer-const`
- no assignments: `functional/immutable-data` at `"error"` with **no options
  override**, so `ignoreImmediateMutation` keeps its plugin default,
  `no-param-reassign` with `["error", { "props": true }]`, `no-plusplus`
- no loops: `functional/no-loop-statements`
- no `any`: `@typescript-eslint/no-explicit-any`,
  `@typescript-eslint/no-unsafe-argument`,
  `@typescript-eslint/no-unsafe-assignment`,
  `@typescript-eslint/no-unsafe-call`,
  `@typescript-eslint/no-unsafe-member-access`,
  `@typescript-eslint/no-unsafe-return`,
  `@typescript-eslint/no-unsafe-function-type`
- no route around a type error:
  `@typescript-eslint/ban-ts-comment` with `["error", { "ts-ignore": true,
"ts-expect-error": true }]`, `@typescript-eslint/no-non-null-assertion`,
  `@typescript-eslint/no-unsafe-type-assertion`
- `no-console`: `"off"`

Framework relaxations holds `@typescript-eslint/no-misused-promises` with
`["error", { "checksVoidReturn": { "arguments": false } }]`. No lock rule
may appear in this section.

- [ ] **Step 3: Verify `eslint-disable` is inert (Review Focus 1)**

Write a probe file `src/tmp-escape-probe.ts`:

```ts
// eslint-disable-next-line functional/no-let
let probe = 1;
export const value = probe;
```

Run: `bun run lint`
Expected: FAIL, naming `functional/no-let` in `src/tmp-escape-probe.ts`. If
it passes, `--no-inline-config` is not taking effect and the escape hatch is
open. Delete the probe file.

- [ ] **Step 4: Verify casts are caught (Review Focus 2)**

Write `src/tmp-cast-probe.ts`:

```ts
export const sneaky = 1 as unknown as string;
```

Run: `bun run lint`
Expected: FAIL on `@typescript-eslint/no-unsafe-type-assertion`. Delete the
probe file.

- [ ] **Step 5: Make the existing source pass**

Run: `bun run lint` and fix every reported problem. Known work:

- `src/inngest.ts`: type the event schema on the client so `event.data` is
  not `any`:
  `new Inngest<{ Events: { "demo/hello.world": { data: { name?: string } } } }>({ id: "contract-features" })`
- `src/functions/hello.ts`: with the schema typed, `event.data?.name` becomes
  `event.data.name`; drop the unnecessary optional chain rather than
  asserting.

Do not introduce a cast or a type-suppression comment anywhere. If a lock
cannot be satisfied without one, stop and report.

- [ ] **Step 6: Verify the locks hold on clean code**

Run: `bun run lint`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add eslint.config.ts package.json bun.lock src
git commit -m "build: enforce functional style locks with eslint"
```

---

### Task 5: Pre-commit Gate

**Files:**

- Create: `.husky/pre-commit`
- Modify: `package.json` (`build`, `prepare` scripts)

**Interfaces:**

- Consumes: `format:check` (Task 3), `lint` (Task 4), `typecheck` (Task 2).
- Produces: commits rejected when any of the four checks fails.

- [ ] **Step 1: Add the scripts**

Add `"build": "bun build src/index.ts --target bun --outdir ./dist"` and
`"prepare": "husky"` to `package.json`. `dist/` is already in `.gitignore`;
verify rather than add.

- [ ] **Step 2: Install the hook**

Run: `bun install` (runs `prepare`), then write `.husky/pre-commit`:

```sh
set -e
bun run format:check
bun run lint
bun run typecheck
bun run build
```

`set -e` is the first line and is not optional.

- [ ] **Step 3: Verify the hook is installed**

Run: `git config core.hooksPath`
Expected: `.husky/_` or `.husky`.

- [ ] **Step 4: Verify the gate rejects (Review Focus 3 and 4)**

Add `let gateProbe = 1;` to `src/send.ts`, stage it, and run `git commit -m
"probe"`.
Expected: the commit is rejected, and `lint` is the check that rejects it.
Record which check rejected it. If the commit **succeeds**, `set -e` is
missing from the hook and it ran through to `build` regardless; that is the
failure this step exists to catch.

Then restore `src/send.ts` with `git checkout -- src/send.ts` and confirm the
hook runs all four checks to completion on clean code:
Run: `bun run format:check && bun run lint && bun run typecheck && bun run build`
Expected: exit 0. If `build` passes while `typecheck` would fail, the two are
not actually separate and the gate is weaker than intended.

- [ ] **Step 5: Commit**

```bash
git add .husky/pre-commit package.json bun.lock
git commit -m "build: reject commits failing format, lint, typecheck or build"
```

---

### Task 6: Guidelines and Prompting

**Files:**

- Create: `docs/guidelines/functional-typescript.md`
- Modify: `AGENTS.md` (new `## Style` section)
- Modify: `README.md` (new `## Development` section and ToC entry)

**Interfaces:**

- Consumes: the lock list from the spec.
- Produces: the prompting layer that covers what lint cannot express.

- [ ] **Step 1: Write `docs/guidelines/functional-typescript.md`**

Cover what the locks cannot: prefer expressions over statements, prefer
`Array.prototype` transforms over accumulation, name things for what they
return, and what to do when mutation genuinely seems necessary. That last
one is the important part: stop and ask, do not write around the lock. There
is no `eslint-disable` route left, so the only remaining escape is asking.

Keep it under about 80 lines. No em dashes.

- [ ] **Step 2: Add `## Style` to `AGENTS.md`**

Place it after `## Project` and before `## Development loop`. List the locks
one line each: no `let` or `var`, only `const`; no assignment to variables,
parameters or object properties; no `for`, `while` or `do` loops; no `any`
including type assertions; no `eslint-disable`, `@ts-ignore`, `@ts-expect-error`
or non-null `!`. One line pointing at `docs/guidelines/functional-typescript.md`
for everything the linter cannot check.

Also correct the stale line in `## Project` that reads "Current state:
documentation only. There is no application code, package manifest, or build
tooling yet." That is no longer true.

- [ ] **Step 3: Add `## Development` to `README.md`**

Place it after `## Usage` and before `## Architecture Decisions`, and add
`- [Development](#development)` to the Table of Contents in the same
position. The section holds the four commands with a one-line description
each:

```sh
bun run format:check  # Prettier, read-only
bun run lint          # ESLint locks
bun run typecheck     # tsc --noEmit
bun run build         # bundle to dist/
```

One line noting the pre-commit hook runs all four and rejects the commit on
failure.

- [ ] **Step 4: Verify docs (AGENTS.md verification step)**

Run: `bun run format:check && bun run lint && bun run typecheck`
Expected: exit 0 after the Markdown edits.

Run: `grep -c "$(printf '\u2014')" AGENTS.md README.md docs/guidelines/functional-typescript.md`
Expected: `0` for each.

Check the README Table of Contents entries match the `##` headings exactly.

- [ ] **Step 5: Commit**

```bash
git add docs/guidelines AGENTS.md README.md
git commit -m "docs: add functional style guidelines and development commands"
```
