---
status: accepted
date: 2026-10-12
decision-makers: William Van Steen
---

# Workflow engine Inngest

## Context and Problem Statement

The pipeline needs a worker engine, starting with a hello-world loop: one event
from the API, observed in a local UI.

## Decision Drivers

- FOSS only for local use.
- Simplest setup for a small PoC.
- Good local development and hobbyist support.

## Considered Options

- Inngest + inngest-js
- ZIO
- Temporal
- No workflow/worker system

## Decision Outcome

Chosen option: "Inngest + inngest-js", because it is the simplest to set up and
already familiar.

### Consequences

- Good, because the local dev server gives an observable UI for runs.
- Bad, because the pipeline follows Inngest event and SDK conventions.

### Confirmation

Event `demo/hello.world` sent from the API completes in the dev UI on `:8288`.
