# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Integration is now always branch and PR against `main` (see `AGENTS.md`);
  the git remote is `origin`
  (`git@github.com:wvansteen/bp-th-contract-features.git`).
- Bun version is now pinned once via `packageManager` in `package.json`
  (ADR-0004).

### Added

- Initial repository scaffolding: README following
  [standard-readme](https://github.com/RichardLitt/standard-readme), an MIT
  license, and this changelog following
  [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
- Architecture Decision Record process using
  [MADR](https://adr.github.io/madr/), including an ADR template and the
  founding decision to use ADRs (ADR 0000).
- `AGENTS.md` describing the development loop (Plan → Decision → Implement →
  Document) and repository conventions for agents.
- Podman Compose harness (`compose.yaml`) running the Inngest dev server UI
  on `http://localhost:8288`, plus the Bun project scaffold (`package.json`
  with `dev`/`dev:setup` scripts and `elysia` + `inngest` dependencies, Bun
  `1.2.23` pinned via `packageManager`).
- ADRs 0001-0004: Podman Compose container harness, Elysia web
  framework, Inngest workflow engine, and Bun version pinning via
  `packageManager`.
- Hello-world pipeline loop: Elysia API on `:3000` with `GET /` health
  check and Inngest serve handler at `/api/inngest` (via the
  `inngest/bun` adapter), `hello-world` function triggered by the
  `demo/hello.world` event (Inngest v4 `triggers` form), and
  `src/send.ts` to publish the event for local runs observable in the
  Inngest UI on `:8288`. Host commands require `INNGEST_DEV=1` so the
  SDK uses the local dev server instead of cloud mode.
