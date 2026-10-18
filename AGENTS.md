# AGENTS.md

Guidance for agents working in this repository. Commit changes here so everyone
(and every agent) gets the same instructions.

## Project

`bp-th-contract-features` is a proof of concept that builds and tests a small
generative AI pipeline to structure and interact with content from contract
documents. The problem space is still being discovered, so we deliberately work
one small step at a time rather than building everything at once.

Current state: an early prototype. There is application code in `src/`, a
`package.json`, and build tooling.

Intended, non-binding stack. None of this is decided until an ADR says so:

- Pipeline: Inngest
- Web server: Elysia on Bun, TypeScript
- Frontend: Svelte SPA (including the chatbot UI)
- LLM steps: LangChain

Style: mostly functional, leaning on a managed effects system where it earns its
keep. Logging as a side effect is an accepted exception for this PoC.

- **Dependency injection over env access.** Never read env vars or construct
  low-level clients inside a function. Build them at the composition root
  (`src/deps.ts`) and inject them. Pass capabilities as parameters, not globals.
  `drizzle.config.ts` is the one exception: it is a `drizzle-kit` CLI file the
  running app never imports.

## Style

The linter enforces these locks as errors:

- No `let` or `var`; bind with `const`.
- No assignment to variables, parameters, or object properties.
- No `for`, `while`, or `do` loops.
- No `any` anywhere, including type assertions and unsafe casts.
- No `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, or non-null `!`.

For everything the linter cannot check, see
`docs/guidelines/functional-typescript.md`.

## Where scripts live

`package.json` scripts are the project's commands: anything that needs only the
pinned runtime and the repo contents, such as build, typecheck, lint, format, or
running the app itself. Run them with `bun run`.

`mise.toml` tasks are the workspace's commands: anything that needs environment,
services, containers, or ambient config, such as starting and stopping the local
stack or wiring the app to Inngest. Run them with `mise run`.

A mise task may call `bun run`, never the other way round. The pre-commit hook
runs the `bun run` gates, so they must work on a fresh clone with nothing but
`bun install`.

## Development loop

Every piece of work follows the same loop. Do not skip steps.

### 1. Plan

Restate the task in your own words and keep it small. Work on one feature or
decision at a time; prefer the smallest change that answers the current
question. Do not scaffold many libraries or features in one go.

### 2. Decision (if needed)

If the work chooses between meaningful alternatives (a library, a data model, a
hosting approach, a repo layout, an API shape), record an ADR before or
alongside the code that depends on it.

- Copy `docs/decisions/adr-template.md` to `docs/decisions/NNNN-short-title.md`
  using the next free number.
- Fill it in and set its `status` (`proposed`, `accepted`, `rejected`, …).
- To change a past decision, keep the old ADR and mark it
  `superseded by ADR-NNNN`; never delete history. Supersede chains are for
  merged decisions only. While the branch is unmerged, fix the ADR in place.
- Keep ADRs lean: two to three sentences of context, only in-scope drivers and
  options, the outcome with a one-line why, terse consequences, and a one-line
  confirmation as a file or command check. An ADR records the decision and
  leaves the chain of reasoning out: no speculative generality, no support
  matrices, no re-argued pros and cons.

If no meaningful choice is being made, skip this step and move on.

### 3. Implement

Make the smallest change that answers the question. Match the structure, naming,
and style of the surrounding code. When code arrives, it is TypeScript on Bun;
keep it mostly functional and allow logging as a side effect.

### 4. Document

Two updates go with every feature:

- Update `README.md` if behavior, setup, or the goal changed. Keep it
  standard-readme compliant (see below).
- Add a bullet to the `[Unreleased]` section of `CHANGELOG.md` under the
  matching Keep a Changelog category: `Added`, `Changed`, `Deprecated`,
  `Removed`, `Fixed`, or `Security`. Keep bullets short, user-facing summaries
  of shipped application features, not implementation detail. Process (including
  changes to `AGENTS.md` itself), dev environment, and ADR material are out of
  scope for the changelog.

### 5. Clean up

Before cleaning up a workspace (deleting a worktree, finishing a branch), stop
its dev environment first with `mise run dev:teardown`, so the workspace's
containers and networks do not outlive it.

## Tooling for token-efficient exploration

Use these tools before reading files or running broad shell commands. They
reduce token usage without reducing performance:

- osgrep: local, offline semantic code search. Use it to find code by meaning
  ("where is X validated?", "how does the pipeline connect?") instead of
  guessing file paths or grepping for exact strings. Prefer `osgrep_search` for
  conceptual queries, `osgrep_trace` for call graphs, and `osgrep_skeleton` for
  signatures without bodies. Falls back to `grep`/`glob` only when you know the
  exact string or file name.

- RTK: automatically rewrites shell commands to their token-leaner equivalents
  (ultra-compact output, skipped env validation, batched flags). It is active by
  default; it never lifts a deny, silences an ask, or changes what OpenCode's
  own permission rules decide. Do not override or disable it.

Always reach for osgrep + RTK before `read`, `grep`, `glob`, or raw `shell`
calls when exploring the codebase.

## Scope

Everything is out of scope by default. Solve the narrowest problem at hand: no
CI support, no compatibility matrices, no speculative generality. If a task
balloons into custom scope or extra tooling support, stop. The requirements or
the task description were wrong, not the scope. Narrow the task instead of
widening the work.

## Where things live

- `README.md` follows
  [standard-readme](https://github.com/RichardLitt/standard-readme). Sections
  appear in the spec's order; the title carries the repo name; the short
  description is under 120 characters and must match the `package.json` and
  GitHub descriptions. `Install`/`Usage` are omitted until functional code
  exists.
- `CHANGELOG.md` follows
  [Keep a Changelog 1.0.0](https://keepachangelog.com/en/1.0.0/) and
  [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
- `docs/decisions/` holds [MADR](https://adr.github.io/madr/) v4 ADRs.
- `LICENSE` is MIT.
- The git remote is `origin`
  (`git@github.com:wvansteen/bp-th-contract-features.git`). Do not invent URLs
  (issues, changelog compare links); add them only when they exist.

## Verification

Before claiming any work is complete, run the relevant command and read its
output.

- Docs changes: check that links resolve, README headings match the Table of
  Contents, and the changelog entry exists.
- Code changes: run the build, typecheck, and tests once tooling exists.
- Commit small, focused changes with clear messages.

## Stance

Be a neutral co-worker. Follow the evidence, whoever proposed the idea. Two
failures flank neutral and both are wrong: agreeing with the reader to keep
things comfortable, and performing objectivity to look rigorous.

> Implemented with `step.sendEvent`. One deviation: I dropped the self-emitted
> paging event, because it forced the counter back into the payload. Everything
> else matches.

> `processed` cannot live in the payload and keep one run per folder. Pick one:
> per-page events and a counter, or a single run with a loop. The loop has fewer
> moving parts.

- Check the premise first, and say so before starting. Work built on a wrong
  fact gets thrown away.
- A disagreement needs evidence: command output, a type declaration, a doc line,
  `file:line`. Asserting a difference of opinion is not disagreeing.
- Flag your confidence. "Confirmed for 4.23.0, untested against earlier
  versions" beats both guessing and refusing to commit.
- Taste is the reader's call. Naming, formatting, library choice. Do not
  relitigate them.
- Do the work. Raise the objection in a sentence or two, then build it.
- Credit belongs inside the work. Naming what someone got right is useful;
  opening a reply with it is padding.

## Writing

A reply is read by someone who already has the context. Give the answer and the
evidence, in that order. The `humanizer` skill covers prose editing in depth;
the register is below.

Commit to what the evidence supports. Say what you did not check.

> `step.sendEvent` is a durable step and `inngest.send` is not. That difference
> is why a retried run stops re-sending page one.

> Typecheck clean against inngest 4.23.0 and drizzle 0.45.4. 18 tests pass,
> including one that fails a step mid-loop and re-enters the handler.

> The counter can be a local variable, but only because the loop lives inside
> one run. Restore the self-emitted event and it goes back in the payload.

> `package.json` picked up `deep-chat@2.5.1` at 11:25 and it was not my change.
> I left it alone because a branch carrying both makes the rule edit
> unreviewable.

> The SDK camel-cases its responses. I read that off the installed type
> declarations, not the REST docs, so it is confirmed for 10.18.0 and untested
> against earlier majors.

Four failure modes, each a way of avoiding the answer:

- Praise before substance. The reader cannot tell whether you checked.
- Concede, then correct. Agreeing and correcting in one breath agrees with
  whatever the reader already thought, so the reply cannot be wrong. Pick the
  reading the evidence supports. See `Stance`.
- Announcing the next move instead of making it. A promise to check is not a
  result.
- Restating the question or the diagnosis first. That is the one thing the
  reader already has.

One test for the opening paragraph: if deleting it loses no fact, number, or
decision, it was filler. End on the last concrete fact. A recap of your own
reply and an offer to expand are padding.

## Integration

Integration is always branch and PR. Push the work to a feature branch on
`origin` and open a pull request against `main`; never push directly to `main`.

After the plan is implemented, handle each round of review feedback as its own
commit and push it separately: one feedback round, one commit, one push. Never
batch unrelated feedback rounds into a single commit.
