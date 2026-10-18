# Professional chat page for Contract Investigation

## Intent

Replace the bare `{ ok: true }` root and the full-page chat at `/chat` with one
Lake County, Illinois branded page for `Contract Investigation`, carrying the
chat as an embedded assistant panel on its right side. The current chat page is
functionally fine and visually unprofessional; the change is presentation only.

## Goals

- One static page at `/` with a Lake County, Illinois look derived from
  lakecountyil.gov: navy `#00568C`, action blue `#0073BB`, Figtree type.
- A `Contract Investigation` identity: what the tool does, in plain language,
  for deal team members.
- The chat embedded in the page as a fixed assistant panel, bottom right, styled
  to match the page rather than the library's defaults.
- The smallest change that achieves the above.

## Non-goals

- Any document list, contract table, search, or other data on the page.
- Open/close launcher behavior for the chat.
- Changing how the chat talks to Ollama, its model, or its streaming.
- A frontend build step, framework, or new dependency.

## Anti-goals

- A marketing-heavy page: hero plus one section is the whole body.
- Shipping the page on top of the old `/chat` layout; `/chat` becomes a
  redirect.

## Constraints

- No frontend toolchain (ADR-0005): one static HTML file plus one stylesheet,
  served by the existing Elysia static setup.
- Repo style locks (`AGENTS.md`): no `let`, no loops, no `any`, no eslint
  disable comments; the page's script obeys the same discipline.
- The chat keeps its current `directConnection` to Ollama `llama3.2` with
  streaming, unchanged.

## Decisions

- **The page lives at `/`.** `src/index.ts` serves `public/index.html` on `/`
  and redirects `/chat` to `/` so old links keep working.
- **`public/index.html` is rewritten in place**, not split per route: one page,
  one file. `public/lake-county.css` carries the Lake County styling; the page
  keeps its chat script inline.
- **The assistant panel is `position: fixed`, bottom right**, 380px wide capped
  at `min(380px, calc(100vw - 2rem))`, and on viewports under 640px it spans the
  bottom as a sheet. Page content gets right padding on wide screens so the
  panel does not cover text.
- **Styling targets deep-chat's own CSS custom properties** (message colors,
  input area, submit button) inside the panel, so the component matches the
  brand without forking it.
- **Lake County identity**: navy masthead with a text wordmark ("Lake County,
  Illinois" plus "Contract Investigation"), `#0073BB` accents and buttons,
  Figtree with a system-sans fallback. No hotlinked logo asset: the wordmark is
  text, so the page has no external image dependency.

## Left to the builder

- Exact hero and section copy, as long as it names `Contract Investigation` and
  stays factual.
- Exact panel height and internal layout, within the width and position rules
  above.
- Which deep-chat CSS variables to set, as long as the panel reads as one brand.

## Confirmation

`bun run dev` then `curl -s localhost:<port>/` returns HTML whose markup
contains `Contract Investigation` and a `<deep-chat>` element;
`curl -s -o /dev/null -w "%{http_code}" localhost:<port>/chat` returns `302`.
