---
status: accepted
date: 2026-10-19
decision-makers: William Van Steen
---

# Model-written SQL query tool

## Context and Problem Statement

The chat agent answers from the conversation but has no access to the ingested
contract documents. Feeding whole documents into the prompt is not viable, so
the agent needs a way to answer questions from the stored data instead.

## Decision Drivers

- Answer questions from the stored contract data
- No new agent framework before a concrete need exists
- The OpenRouter key stays server-side

## Considered Options

- Model-written SQL, guarded by a parser and a read-only transaction
- A canned endpoint per question shape
- A framework agent with typed query tools

## Decision Outcome

Chosen option: "Model-written SQL, guarded by a parser and a read-only
transaction", because the question shapes are unknown and the guard is cheap.

### Consequences

- Good, because any read shape works without new endpoints.
- Bad, because the parser grammar rejects some valid SQL.
- Bad, because production needs a dedicated read-only database role.

### Confirmation

`grep -q 'accessMode: "read only"' src/db/query.ts` once Task 2 lands.
