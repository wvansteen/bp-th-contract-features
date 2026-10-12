---
status: accepted
date: 2026-10-12
decision-makers: William Van Steen
---

# Workflow engine Inngest

## Context and Problem Statement

We need a workflow/worker engine for the contract-features generative AI pipeline, starting with a hello-world loop that publishes one event from the Elysia API and observes the run in a local UI. Which engine hosts the functions and events?

## Decision Drivers

* FOSS only for the local harness
* Simplest possible setup for a small PoC
* Team familiarity with the tooling
* Good local development plus hobbyist-tier support

## Considered Options

* Inngest + inngest-js
* ZIO
* Temporal
* No workflow/worker system

## Decision Outcome

Chosen option: "Inngest + inngest-js", because it has the simplest setup of the candidates, is already familiar, has good local plus hobbyist support, and there is no reason to skip a worker system for the pipeline.

### Consequences

* Good, because event `demo/hello.world` functions run through the official `inngest-js` SDK with minimal boilerplate.
* Good, because the local Inngest dev server gives an observable UI for runs during development.
* Bad, because the pipeline depends on the Inngest service/SDK conventions for events and retries.

### Confirmation

Task 6 implements the hello-world loop with event `demo/hello.world` served through the Elysia API.

## Pros and Cons of the Options

### Inngest + inngest-js

* Good, because simplest setup of the candidates.
* Good, because familiar to the team.
* Good, because good local development plus hobbyist support.
* Bad, because adds an external service/SDK dependency to the pipeline.

### ZIO

* Good, because strongly-typed functional effects for workflows.
* Bad, because heavier setup and less familiar than Inngest for this PoC.

### Temporal

* Good, because durable execution for complex workflows.
* Bad, because heavier operational setup than needed for a hello-world PoC.

### No workflow/worker system

* Good, because no extra dependency.
* Bad, because no reason to skip a worker system; the pipeline needs background steps, retries, and observability from the start.

## More Information

Relied on by Task 6 for the `demo/hello.world` function and send step.
