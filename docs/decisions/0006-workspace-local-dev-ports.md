---
status: accepted
date: 2026-10-17
decision-makers: William Van Steen
---

# Workspace-local dev ports bound by the stack itself

## Context and Problem Statement

Each workspace (checkout or worktree) stands up its own local stack:
today the Elysia app and the Inngest dev server, with the database
added as the pipeline grows. Host ports are a machine-wide namespace,
so fixed ports in `compose.yaml` mean one workspace's stack blocks
every other workspace's `podman compose up`. The app's address is only
known once it is running, so Inngest must also be told where to call
back after startup.

## Decision Drivers

* Two workspaces must run their stacks, and end-to-end tests, at the
  same time without conflicts.
* Setup must stay one or two commands with no ports recorded or
  threaded through by hand.
* The Inngest integration must also work on a stateless host like
  Vercel.

## Considered Options

* Fixed shared host ports (status quo)
* Ports bound by the stack itself, with Inngest's `connect()` worker
* Ports bound by the stack itself, with `serve()` and a registration
  step

## Decision Outcome

Chosen option: "Ports bound by the stack itself, with `serve()` and a
registration step", because the runtime is the only thing that can
guarantee a port is free, and `serve()` is the integration that also
deploys to stateless hosts.

`compose.yaml` publishes ephemeral host ports, and the app listens on
an auto-selected port. The mise tasks in `mise.toml` read the stack's
published ports from Podman at command time and inject them as
environment variables; `.env` holds secrets only. Registration uses
the documented sync protocol (SDK spec 4.3.1): a `PUT` to the app's
`/api/inngest` makes the SDK register its functions with Inngest. The
`dev` task sends that `PUT` once the app is listening, requesting
`http://host.containers.internal:<port>` (the one URL the Inngest
container can call back at) so the SDK reports it as the app's
address. The app itself carries none of this.

### Consequences

* Good, because parallel workspaces never collide and nothing records
  or threads ports.
* Good, because `serve()` is the one integration mode for local dev
  and stateless deployment; no dev/deploy mode switch is needed.
* Bad, because dev commands run through mise, and checks read the
  app's port from its startup output.

### Confirmation

In two worktrees at once, `mise run dev` starts a stack and logs a
`200` sync for each app.

## More Information

Revisit if the end-to-end checks need a stable app URL instead of
reading it from the startup output.
