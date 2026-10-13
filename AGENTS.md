# AGENTS.md

Guidance for agents working in this repository. Commit changes here so everyone
(and every agent) gets the same instructions.

## Project

`bp-th-contract-features` is a proof of concept that **builds and tests a small
generative AI pipeline to structure and interact with content from contract
documents**. The problem space is still being discovered, so we deliberately
work one small step at a time rather than building everything at once.

Current state: **documentation only**. There is no application code, package
manifest, or build tooling yet.

Intended, *non-binding* stack — none of this is decided until an ADR says so:

- Pipeline: Inngest
- Web server: Elysia on Bun, TypeScript
- Frontend: Svelte SPA (including the chatbot UI)
- LLM steps: LangChain

Style: mostly functional, leaning on a managed effects system where it earns its
keep. Logging as a side effect is an accepted exception for this PoC.

## Development loop

Every piece of work follows the same loop. Do not skip steps.

### 1. Plan

Restate the task in your own words and keep it small. Work on **one feature or
decision at a time**; prefer the smallest change that answers the current
question. Do not scaffold many libraries or features in one go.

### 2. Decision (if needed)

If the work chooses between meaningful alternatives (a library, a data model, a
hosting approach, a repo layout, an API shape), record an ADR **before or
alongside** the code that depends on it.

- Copy `docs/decisions/adr-template.md` to
  `docs/decisions/NNNN-short-title.md` using the next free number.
- Fill it in and set its `status` (`proposed`, `accepted`, `rejected`, …).
- To change a past decision, keep the old ADR and mark it `superseded by
  ADR-NNNN`; never delete history. Supersede chains are for merged
  decisions only — while the branch is unmerged, fix the ADR in place.
- Keep ADRs lean: 2–3 sentences of context, only in-scope drivers and
  options, the outcome with a one-line why, terse consequences, and a
  one-line confirmation as a file or command check. An ADR records the
  decision, not the chain of reasoning behind it: no speculative
  generality, no support matrices, no re-argued pros and cons.

If no meaningful choice is being made, **skip this step** and move on.

### 3. Implement

Make the smallest change that answers the question. Match the structure,
naming, and style of the surrounding code. When code arrives, it is TypeScript
on Bun; keep it mostly functional and allow logging as a side effect.

### 4. Document

Two updates go with every feature:

- Update `README.md` if behavior, setup, or the goal changed. Keep it
  standard-readme compliant (see below).
- Add a bullet to the `[Unreleased]` section of `CHANGELOG.md` under the matching
  Keep a Changelog category: `Added`, `Changed`, `Deprecated`, `Removed`,
  `Fixed`, or `Security`. Keep bullets short, user-facing summaries, not
  implementation detail.

## Scope

Everything is out of scope by default. Solve the narrowest problem at
hand: no CI support, no compatibility matrices, no speculative
generality. If a task balloons into custom scope or extra tooling
support, stop — the requirements or the task description were wrong, not
the scope. Narrow the task instead of widening the work.

## Where things live

- `README.md` — follows [standard-readme](https://github.com/RichardLitt/standard-readme).
  Sections appear in the spec's order; the title carries the repo name; the
  short description is under 120 characters and must match the `package.json`
  and GitHub descriptions. `Install`/`Usage` are omitted until functional code
  exists.
- `CHANGELOG.md` — follows
  [Keep a Changelog 1.0.0](https://keepachangelog.com/en/1.0.0/) and
  [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
- `docs/decisions/` — [MADR](https://adr.github.io/madr/) v4 ADRs.
- `LICENSE` — MIT.
- The git remote is `origin`
  (`git@github.com:wvansteen/bp-th-contract-features.git`). **Do not invent
  URLs** (issues, changelog compare links); add them only when they exist.

## Verification

Before claiming any work is complete, run the relevant command and read its
output — evidence first, not confidence.

- Docs changes: check that links resolve, README headings match the Table of
  Contents, and the changelog entry exists.
- Code changes: run the build, typecheck, and tests once tooling exists.
- Commit small, focused changes with clear messages.

## Integration

Integration is always branch and PR. Push the work to a feature branch on
`origin` and open a pull request against `main`; never push directly to
`main`.

After the plan is implemented, handle each round of review feedback as
its own commit and push it separately — one feedback round, one commit,
one push. Never batch unrelated feedback rounds into a single commit.
