# Vision

Human-owned file: agents never edit `specs/VISION.md` — propose changes to the product owner instead. It states why the project exists; `specs/**` states what the software does today, and `ROADMAP.md` holds what comes next.

## Purpose

A self-hosted orchestrator for autonomous agents that run unattended: scheduled, steerable when needed, sandboxed, with every action recorded. Your keys, your data, your hardware.

## Goals

- **Self-hosted** — one server process; local SQLite, local Docker, your provider endpoint; no SaaS dependency or lock-in.
- **Bots are workers, not chat sessions** — durable identity, memory, workspace and triggers; they work on their own and need a human only when something needs a decision.
- **Human in command with minimal interaction** — normal operation requires no babysitting; steering, interrupting, pausing or stopping everything is available but should rarely be needed.
- **Trust through evidence** — every run replays end to end; secrets never leak into transcripts or prompts.
- **Sandboxed by default** — side effects stay in per-bot containers with explicit grants.
- **Provider-agnostic** — any OpenAI-compatible endpoint; the model is a setting, not the architecture.
- **Composable by design** — capabilities come from data, not code: roles, skills, MCP tools, Projects and templates; anything a user can do repeatedly should be reusable.
- **Own your environment** — each bot runs in a sandbox image you define (Dockerfile per machine) with per-bot CPU/memory limits.
- **Costs stay visible and capped** — token usage is reported everywhere it matters and budgets stop runaway spend automatically.
- **API-first** — the full product is available over REST with per-user keys; the web UI is one client of that API, not a requirement to get work done (CLI planned).
- **Shared by a small team** — multiple users share one console equally, from web, PWA or API; it stays one server to run and back up.
- **Fun to operate** — bots have visible personality: big expressive avatars and lively UI feedback; running your own agents should feel like a living crew, not an enterprise console.
