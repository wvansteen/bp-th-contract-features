# Functional TypeScript Guidelines

The linter enforces the hard locks. This document covers the judgement the
linter cannot: how to write functional TypeScript when no rule is watching. The
locks themselves are listed in the `## Style` section of `AGENTS.md`.

## Prefer expressions over statements

An expression produces a value; a statement produces a side effect. Reach for
the expression first.

- Return a value instead of assigning to a variable declared above.
- Use a conditional expression where you would branch only to assign.
- Keep functions small enough that a single expression reads clearly.
- When a function outgrows that, split it. Do not reach for a statement.

Statements are not banned outright: `switch` and an early `return` are
idiomatic. The rule is that a statement has to earn its place against an
expression that would say the same thing.

## Prefer Array.prototype transforms over accumulation

Build results with `map`, `filter`, `reduce`, `flatMap`, `find`, `some` and
`every` rather than an empty array and a loop that pushes into it.

```ts
// Prefer
const names = users.map((user) => user.name);

// Over
const names: string[] = [];
for (const user of users) {
  names.push(user.name);
}
```

`reduce` folds to a single value; it is not for rebuilding what `map` or
`filter` already express. When the transform needs an early exit, `find` or
`some` usually says it. When it needs to stop on a side effect, that is a signal
to reconsider the shape rather than to write a loop.

## Name things for what they return

A function name describes its return value, not the work it does.

- `formatDate`, not `handleDate`.
- `parseInvoice`, not `processInvoice`.
- A boolean reads as a question: `isValid`, `hasExpired`, `canSubmit`.

If the honest name is a verb phrase about side effects, the function is probably
doing too much. Split it until each part has a value to be named after.

## When mutation seems necessary

Sometimes a library wants an object mutated, a hot path seems to need
accumulation, or a callback reads more clearly with an assignment in it. This is
the moment these guidelines exist for.

Stop and ask. Do not work around the lock, and do not invent an abstraction to
smuggle the state through. There is no `eslint-disable` route left and no cast
route left, so any workaround would be a hidden escape hatch, which is the exact
failure these locks exist to prevent. Describe the case and let the decision be
made openly, as an ADR or a deliberate change to the locks if it is real.
