# Obsidian Intelligence Layer (OIL) — Spec v0.2

> Knowledge Layer for AI Agent Workflows · Draft for Review · March 2026

OIL transforms a personal Obsidian vault from passive file storage into an active, queryable knowledge layer — the persistent memory substrate that bridges AI agent workflows across CRM, M365, and other MCP-connected systems. OIL owns the vault; the copilot orchestrates across MCPs.

---

## Documents

| # | Section | Summary |
|---|---------|---------|
| 1 | [Executive Summary](./01-executive-summary.md) | What OIL is, why it exists, core design philosophy |
| 2 | [Problem Statement](./02-problem-statement.md) | What the existing MCP gets wrong, what we actually need |
| 3 | [Architecture](./03-architecture.md) | System layers, integration map, vault schema, vault protocol phases |
| 4 | [Core Capabilities](./04-core-capabilities.md) | Graph index, semantic search, session cache, tiered write gate |
| 5 | [Tool Surface](./05-tool-surface.md) | Full tool reference: orient, retrieve, and write tools (tiered) |
| 6 | [Configuration](./06-configuration.md) | `oil.config.yaml` schema + skills architecture decision |
| 7 | [Integration Flows](./07-integration-flows.md) | Pre-call brief, post-call notes, pipeline review, onboarding — worked examples |
| 8 | [Implementation Roadmap](./08-roadmap.md) | 4-phase build plan + fork strategy for bitbonsai/mcp-obsidian |
| 9 | [Open Questions](./09-open-questions.md) | Resolved decisions + remaining open questions |
| 10 | [Success Criteria](./10-success-criteria.md) | How we know it's working |

---

## Key Principles

- **Knowledge layer, not orchestrator** — OIL owns the vault; the copilot decides when and how to use it alongside CRM and M365 MCPs
- **Reads are autonomous** — the agent can orient, retrieve, and resolve IDs without human approval
- **Writes are tiered** — auto-confirmed for low-risk appends (agent insights, Connect hooks); gated with diff review for creates and overwrites
- **The vault stays native** — all files remain valid Obsidian markdown; no proprietary schemas, no lock-in
- **Vault-first ID resolution** — customer files store CRM GUIDs and TPIDs, eliminating discovery queries against external systems
- **People are first-class** — person→customer resolution bridges the gap between M365 identities and vault knowledge
