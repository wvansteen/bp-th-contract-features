# Style Guardrails: Design Spec

**Date:** 2026-10-17 **Status:** Draft, awaiting approval

## Intent

Violations of this project's functional style should fail at tool-call time, not
at self code review. Today the only feedback loop is a human reading a diff at
the end, and by then a bad section has already been written; an over-engineered
one has been written twice. The locks below move the lintable subset of that
feedback to the moment the code is written.

This does not try to catch every failure. Over-engineering and broken
encapsulation are design problems and stay out of scope here. The goal is that
the things ESLint and the TypeScript compiler can decide, they decide hard.

## Goals

- Hard locks on the rules below, enforced by tooling that exits non-zero
- No route around a lock from inside a source file for standard mutable code
- A pre-commit hook that rejects a commit whose format, lint, typecheck, or
  build fails
- A rule set that is cheap to extend: adding a lock is a one-line change
- Written guidelines for the part lint cannot express

## Non-Goals

- Catching complexity, over-engineering, or "framework-supported" violations
- Enforcing module boundaries or import direction
- Type-level immutability (`prefer-immutable-types`,
  `type-declaration-immutability`)
- Hand-written or bespoke lint rules. Community rules only:
  `eslint-plugin-functional`, `typescript-eslint`, ESLint core.
- Guards against deliberate circumvention (`Reflect.set`, `WeakMap` mutators,
  `constructor.constructor`), which no community rule covers cleanly
- CI, test tooling, or hosting
- Biome or Oxlint

## The Locks

Every rule is `error` severity, and lint runs with `--max-warnings 0`. A warning
does not fail a tool call, so warnings are not an enforcement mechanism here.

| Lock                         | Rule                                                                           | Notes                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| only `const`                 | `functional/no-let`                                                            | bans `let` outright                                                                                                               |
|                              | `no-var`                                                                       |                                                                                                                                   |
|                              | `prefer-const`                                                                 | fixer only; aids conversion                                                                                                       |
| no assignments               | `functional/immutable-data`                                                    | property writes, `delete`, `push`/`sort`/`splice`, `Object.assign`, `Map.set`, `Set.add`. Type-aware.                             |
|                              | `no-param-reassign` with `props: true`                                         | parameters are constants                                                                                                          |
|                              | `no-plusplus`                                                                  | `i++` is mutation                                                                                                                 |
| never mutate a `const`       | `functional/immutable-data`                                                    | same rule. `ignoreImmediateMutation` keeps its default, so `[...xs].sort()` is allowed while `const o = {}; o.x = 1` is not       |
| no loops                     | `functional/no-loop-statements`                                                | bans `for`, `for..of`, `for..in`, `while`, `do`                                                                                   |
| no `break`/`continue`/`goto` | _satisfied by the above_                                                       | no loops leaves only `switch`/`break`, which is idiomatic and stays allowed. `goto` does not exist in JS                          |
| no `any`                     | `@typescript-eslint/no-explicit-any`                                           | the literal token                                                                                                                 |
|                              | `@typescript-eslint/no-unsafe-{argument,assignment,call,member-access,return}` | `any` leaking in from `JSON.parse`, `res.json()`, or an untyped dependency: the leak `no-explicit-any` cannot see                 |
|                              | `@typescript-eslint/restrict-template-expressions` with `allowAny: false`      | `any` interpolated into a template literal, which the `no-unsafe-*` family does not cover and the rule allows by default          |
|                              | `@typescript-eslint/no-unsafe-function-type`                                   | the `Function` type                                                                                                               |
| no `eval`                    | `no-eval`                                                                      | `eval` smuggles `let`, assignment, loops and `any` past every lock at once; `new Function` is already caught by `no-implied-eval` |

`functional/no-expression-statements`, `functional/no-return-void`,
`functional/no-classes`, `functional/no-this-expressions`,
`functional/no-throw-statements` and `functional/no-try-statements` stay
**off**. Logging is an accepted side effect in this repo (see `AGENTS.md`), and
Elysia and Inngest handlers are legitimately imperative at the edges.

## No Route Around a Type Error

`ban-ts-comment` alone only covers `@ts-ignore`. The same route stays open
through `@ts-expect-error`, `as unknown as T`, and non-null `!`. All of it
closes:

| Rule                                          | Setting                                    |
| --------------------------------------------- | ------------------------------------------ |
| `@typescript-eslint/ban-ts-comment`           | `ts-ignore: true`, `ts-expect-error: true` |
| `@typescript-eslint/no-non-null-assertion`    | `error`                                    |
| `@typescript-eslint/no-unsafe-type-assertion` | `error`                                    |

A value of unknown shape becomes a real type, not a cast. In `inngest@4.23.0`
event typing lives on the trigger, so `src/inngest.ts` defines
`eventType("demo/hello.world", { schema: staticSchema<{ name?: string }>() })`
and `src/functions/hello.ts` uses it as the trigger. `event.data` is then a real
type, with no assertion.

## Escapes Are Banned In-File

ESLint runs with `--no-inline-config`. No `eslint-disable`, `eslint-enable`,
`eslint`, or `global` comment has any effect in any file. Every exception lives
in `eslint.config.ts`, where it is visible and reviewable in one place.

An agent that hits a lock therefore cannot write its way past it in the file it
is editing. It has to stop and ask. That is the intended behaviour, not an
accident.

One boundary is deliberate. The locks cover the standard ways mutable code gets
written: assignment, property writes, mutating methods, loops, `let`, `any`,
casts, `eval`. They do not cover code that deliberately routes around them, such
as `Reflect.set`, a `WeakMap` mutator, or a `CallableFunction` invoked through
`f.call(...)`. Every one of those needs a community rule that cannot express the
check without hand-written config, and closing them costs more than it is worth:
at that point writing the code correctly is easier than smuggling. Ordinary
mutable code hits a lock. Deliberate circumvention does not, and that is
accepted.

## Locks Never Relax

When a lock rule fires on framework-shaped code, the code changes or the work
stops and escalates. The rule does not get downgraded.

The "framework relaxations" section of `eslint.config.ts` may only ever hold
non-lock rules. `@typescript-eslint/no-misused-promises` is its only occupant,
and that relaxation is pre-emptive: it covers a promise-returning callback
passed as an argument, a signature class that has not appeared in the current
Elysia and Inngest code. Lock rules can never acquire a per-file hole, because a
lock with a hole is a default.

## Why ESLint and Prettier

Biome is a single Rust binary that replaces both tools and is much faster, but
it has no equivalent of `functional/no-let`, `functional/immutable-data` or
`functional/no-loop-statements`. It has no `noLet` rule at all, and its
`useConst` is `prefer-const`, which silently permits a reassignable `let`. Its
plugin language is GritQL, with no JS/TS API and no plugin options, so the locks
could not be added later. Oxlint would run `eslint-plugin-functional` unchanged,
but its ESLint-compatible plugin API is still alpha.

## Enforcement Layers

| Layer      | Command                              | Catches                                  |
| ---------- | ------------------------------------ | ---------------------------------------- |
| Format     | `bun run format:check`               | Prettier drift                           |
| Lint       | `bun run lint`                       | the locks above                          |
| Typecheck  | `bun run typecheck` (`tsc --noEmit`) | type errors                              |
| Build      | `bun run build`                      | bundling and module resolution           |
| Pre-commit | all four, in that order              | anything above, before the commit exists |

`bun build` does **not** typecheck: Bun's transpiler erases types without
verifying them. `typecheck` is its own step and cannot be folded into `build`.
Elysia's own documented sequence runs them separately too.

`build` means Elysia's quick-start command,
`bun build src/index.ts --target bun --outdir ./dist`, so it stays fast and does
not bake in a target platform before hosting is decided.

The hook script begins with `set -e`. Without it a shell hook keeps going past a
failing command and the gate silently does not gate. The hook only runs
read-only checks: a hook that silently rewrites the working tree is itself a
mutation, and `--fix` would launder violations into compliance.

Husky 9 installs hooks via `"prepare": "husky"`; `bun install` regenerates
`.husky/_`, which is gitignored. `dist/` is gitignored too.

## How This Fails Hard for Agents

1. Everything is `error`, and lint runs with `--max-warnings 0`, so the tool
   call exits non-zero.
2. `functional/no-let`, `functional/immutable-data` and
   `functional/no-loop-statements` have **no fixers**, so `--fix` cannot turn a
   violation into compliance.
3. `--no-inline-config` removes the `eslint-disable` route.
4. `ban-ts-comment`, `no-non-null-assertion` and `no-unsafe-type-assertion`
   remove the cast and assertion routes.

## Extensibility

`eslint.config.ts` is the single extension point, with three labelled sections:
hard locks, framework relaxations (non-lock rules only), and an "add rules here"
tail. Project-specific rules go in as a local plugin defined inline in that
file: ESLint supports defining rules at runtime without publishing a package, so
a new lock is one line plus a rule. A new plugin is one import plus one array
entry.

## Guidelines

`docs/guidelines/functional-typescript.md` carries what lint cannot express:
prefer expressions over statements, prefer `Array.prototype` transforms over
accumulation, and what to do when mutation genuinely seems necessary (stop and
ask, rather than escape). `AGENTS.md` gets a short `## Style` section listing
the locks one line each with a pointer, because that is the file agents actually
read.

## Scope of Prettier

Prettier covers code, config and Markdown: `*.ts`, `*.js`, `*.json`, `*.yaml`,
`*.yml`, `*.md`, `public/index.html`.

`proseWrap` is set to `"always"`, so Prettier owns prose wrapping and source
line breaks are never hand-managed. Prettier also normalises table alignment,
list markers, emphasis and ordered-list numbering, and it formats fenced code
blocks via `embeddedLanguageFormatting: "auto"`.

That last one is the reason Markdown is in scope rather than out: the
TypeScript, JSON and shell samples in the ADRs and in this document format the
same way `src/` does. Excluding Markdown would leave those samples unformatted
and unenforced, which is drift of the same kind the locks exist to prevent.
Decided by the requester after challenge.

## Tech Stack

- ESLint 10, flat config in `eslint.config.ts`
- `typescript-eslint`, `recommendedTypeChecked`, curated downward where it
  fights the framework (non-lock rules only)
- `eslint-plugin-functional`
- Prettier 3 plus `eslint-config-prettier`, run as a separate command rather
  than as an ESLint rule
- husky 9
- `tsconfig.json`, new, `strict: true`: Elysia requires it, and it is what
  switches on `noImplicitAny`

## Notes for the Builder

- There is no `tsconfig.json` today. `@types/bun` belongs in devDependencies;
  the code uses `Bun.file`.
- The locks did not fire on the original four source files. The Inngest event in
  `src/inngest.ts` and `src/functions/hello.ts` was typed anyway, as the plan
  intends, so `event.data` is a real type rather than a cast.
- `no-console` stays **off**.
- Version compatibility between ESLint 10, `typescript-eslint` and
  `eslint-plugin-functional` is verified at install time, not assumed here.

## Decisions Left to the Builder

- Exact `tsconfig.json` compiler options beyond `strict`, as long as
  `noImplicitAny` is on and `tsc --noEmit` passes.
- Prettier option values, except `proseWrap` which is pinned to `"always"` and
  must not be changed.
- Whether the hook lists the four commands separately or chains them, given
  `set -e` is present either way.
- Where in the standard-readme structure the four commands go in `README.md`.

## Confirmed Calls

Settled by the author of this document rather than by its reviewer. Each is open
to correction on review.

- **`ignoreImmediateMutation` keeps its plugin default.** `[...xs].sort()` is
  idiomatic and mutates only an unreachable temporary. The stated rule, never
  mutate a `const`, is still enforced either way.
- **Test-file relaxations are skipped.** There are no tests, and `AGENTS.md`
  forbids speculative generality.
- **Two ADRs, not three.** ADR 0006 covers the lint and format toolchain (ESLint
  plus Prettier plus `eslint-plugin-functional`, against Biome and Oxlint). ADR
  0007 covers the pre-commit gate. The individual rule list is design, not
  architecture, and lives here.
- **No changelog entry.** `AGENTS.md` puts dev-environment and tooling changes
  out of scope for the changelog.
