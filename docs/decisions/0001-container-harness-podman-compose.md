---
status: accepted
date: 2026-10-12
decision-makers: William Van Steen
---

# Container harness Podman Compose

## Context and Problem Statement

We need a local environment for running infrastructure services (Inngest dev server, databases) while developing the contract-features pipeline. The Elysia API runs on host Bun, not in a container, so the harness only manages infra containers. How do we run local infra containers simply and reproducibly?

## Decision Drivers

* FOSS only for the local harness; no Docker Desktop dependency
* Compose-simple: as simple or simpler than docker-compose, single canonical file
* No Helm charts / no Kubernetes manifests for local dev
* OCI-compatible containers

## Considered Options

* Podman + podman-compose (Compose Spec)
* Podman Quadlet
* Rancher Desktop (containerd / dockerd)
* kind / k3d / minikube

## Decision Outcome

Chosen option: "Podman + podman-compose (Compose Spec)", because it is daemonless and rootless-native on Linux, uses a single canonical `compose.yaml`, and meets all drivers with the least complexity.

### Consequences

* Good, because infra is defined once in the canonical `compose.yaml` tested with `podman compose`.
* Good, because only infra is containerized; the Elysia API stays on host Bun, keeping the dev loop fast.
* Bad, because contributors must have Podman plus a compose provider instead of plain Docker.

### Confirmation

Infra-only rule holds: `compose.yaml` contains no app service. `podman compose config` validates the canonical file.

## Pros and Cons of the Options

### Podman + podman-compose (Compose Spec)

* Good, because daemonless and rootless-native on Linux.
* Good, because a single `compose.yaml` covers all infra services.
* Good, because fully FOSS and OCI-compatible.

### Podman Quadlet

* Good, because native systemd integration with Podman.
* Bad, because it splits configuration into per-container files instead of one compose file, adding complexity for this PoC.

### Rancher Desktop (containerd / dockerd)

* Good, because it provides a desktop Kubernetes plus container runtime.
* Bad, because it does not support the Podman engine, and upstream support is not planned.

### kind / k3d / minikube

* Good, because they reproduce production-like Kubernetes locally.
* Bad, because Kubernetes manifests violate the simplicity driver; no Helm or K8s manifests for local dev.

## More Information

Canonical file: `compose.yaml`. Elysia runs on host Bun; containers are infra-only.
