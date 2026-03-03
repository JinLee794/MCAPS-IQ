---
applyTo: ".connect/hooks/**"
description: "Connect hook formatting + evidence schema, Obsidian vault routing for Connect evidence capture"
---
# Connect Hook Writing Guide

When writing Connect hooks:

- Use the schema below for every hook entry.
- Each hook must map to at least one of the **3 circles of impact**.
- Include concrete evidence and a source pointer (PR / Issue / Doc / Thread).
- Keep each hook to **3–6 lines**.

## Storage Routing

Connect hooks follow the vault-first storage pattern defined in `.github/instructions/obsidian-vault.instructions.md`.

**Summary:**
1. **Vault available**: Append to `Customers/<CustomerName>.md` under `## Connect Hooks` (use `patch_note` with `operation: "append"` and `heading: "Connect Hooks"`). Create the file/section if it doesn't exist.
2. **Always**: Write to `.connect/hooks/hooks.md` as a repo-tracked backup, regardless of vault availability.
3. **Vault unavailable**: `.connect/hooks/hooks.md` is the sole destination.

## Schema

```yaml
- Date:
- Circle(s): Individual | Team/Org | Customer/Business
- Hook:
- Evidence:
- Source:
- Next step:
```

## Circle of Impact Definitions

| Circle | What counts |
|---|---|
| **Individual** | Personal growth, skill development, learning, certifications |
| **Team/Org** | Improving team processes, mentoring, tooling, documentation |
| **Customer/Business** | Direct customer impact, revenue, adoption, satisfaction |

## Example

```yaml
- Date: 2026-02-24
- Circle(s): Team/Org, Customer/Business
- Hook: Built MCP-based CRM tooling that reduced milestone hygiene prep from ~45 min to <5 min per account
- Evidence: Weekly milestone review now automated; 3 CSAMs onboarded to the workflow
- Source: PR #42, recipe weekly-milestone-hygiene.md
- Next step: Expand to cover task-gap detection across full SE portfolio
```
