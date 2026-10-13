---
status: accepted
date: 2026-10-12
decision-makers: William Van Steen
---

# Container harness Podman Compose

## Context and Problem Statement

Local infrastructure (Inngest dev server, databases) runs in containers
while the Elysia API runs on host Bun. The harness must run local infra
containers simply and reproducibly.

## Decision Drivers

* FOSS only; no Docker Desktop dependency.
* As simple as docker-compose: one canonical file.
* No Helm charts or Kubernetes manifests for local dev.

## Considered Options

* Podman + podman-compose (Compose Spec)
* Podman Quadlet
* Rancher Desktop (containerd / dockerd)
* kind / k3d / minikube

## Decision Outcome

Chosen option: "Podman + podman-compose (Compose Spec)", because it is
daemonless and rootless on Linux with a single `compose.yaml`.

### Consequences

* Good, because infra is defined once; the API stays on host Bun.
* Bad, because contributors need Podman plus a compose provider.

### Confirmation

`compose.yaml` contains no app service; `podman compose config` passes.
