# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Working rules in `AGENTS.md`: lean ADRs, branch-and-PR integration,
  out-of-scope by default, one commit per feedback round, and
  summary-style changelog bullets.
- Bun version pinned once via `packageManager` in `package.json`
  (ADR-0004); the git remote is `origin`.

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
- Local dev environment: Podman Compose infra with Inngest dev server,
  plus a Bun project scaffold with `dev`/`dev:setup` scripts.
- ADRs 0001-0004: container harness, web framework, workflow engine, and
  Bun version pinning.
- Hello-world pipeline: publish an event from the Elysia API and observe
  the run in the local Inngest UI.
