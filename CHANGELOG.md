# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Repo scaffolding: standard-readme README, MIT license, this changelog.
- ADR process ([MADR](https://adr.github.io/madr/)) with template and founding
  decision (ADR 0000).
- `AGENTS.md` agent development loop and repo conventions.
- Contract ingest pipeline: `POST /process-contracts` pages through a Box folder
  and processes each document's metadata via Inngest events; `GET /contracts`
  returns all stored document metadata from Postgres.
- Lake County, Illinois branded `Contract Investigation` page at `/`, with the
- Smart feature prompts for the 13 contract features in `docs/features.yml`, so
  document classification returns bare values and clause text with no
  commentary.
- chat embedded as a bottom-right assistant.
- Vercel deployment: one Vercel Function on the Bun runtime, migrations applied
  at build time.
- Smart features: each processed document is classified against the configured
  smart feature prompts, with the document PDF sent to the model per feature;
  the results are stored on the document record and returned by
  `GET /contracts`.

### TODO

- Potential feature, not implemented: `compliance_obligations`, extracting the
  certifications and legal flowdowns a contract carries (debarment, lobbying
  disclosures, prevailing wages, insurance minimums). Deferred to keep the first
  feature set small.

### Changed

- Chat replies now stream through the app's own API from a hosted model set by
  `CHAT_MODEL`, replacing the local Ollama model.

### Fixed

- Document processing no longer fails with "Reasoning is mandatory for this
  endpoint and cannot be disabled" on models that require reasoning, such as
  `openai/gpt-5-nano`.
- The deployed app serves the Deep Chat bundle as a static asset instead of
  reading `node_modules/deep-chat/dist`, which the function does not carry.
