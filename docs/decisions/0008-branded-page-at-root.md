---
status: accepted
date: 2026-10-18
decision-makers: William Van Steen
---

# Branded page served at the root

## Context and Problem Statement

The root route returned JSON and the chat lived at `/chat` as a bare full-page
component. The tool now needs one professional `Contract Investigation` face.

## Decision Drivers

- One entry point for a single-page tool.
- Old `/chat` links keep working.

## Considered Options

- Serve the branded page at `/` and redirect `/chat` to it
- Keep the chat at `/chat` and put the branded page there
- Serve the branded page at both `/` and `/chat`

## Decision Outcome

Chosen option: "Serve the branded page at `/` and redirect `/chat` to it",
because one URL is all a single-page tool needs.

### Consequences

- Good, because there is one URL and one page to keep on-brand.
- Bad, because the old direct chat URL is no longer a page.

### Confirmation

`curl -s -o /dev/null -w "%{http_code}" localhost:<port>/chat` prints `302`.
