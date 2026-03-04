# Team Knowledge Layer for Copilot Spaces

This directory is a **living, agentic knowledge base** designed to be referenced by [GitHub Copilot Spaces](https://github.com/features/copilot). It translates the single-user [Obsidian Intelligence Layer (OIL)](../mcp/oil/) patterns into a git-backed, team-collaborative structure.

## Why This Exists

Account teams operate across disconnected mediums — CRM, email, meetings, chat. Critical context lives in people's heads or isolated local notes. This knowledge layer creates a **shared memory** that Copilot can query, so every team member gets the full picture.

## How It Works

| OIL (single-user) | Spaces (team) | Why |
|---|---|---|
| Obsidian vault | Git-backed folders | Versioned, collaborative, auditable |
| Write gates (tiered) | Pull requests + reviews | Git-native approval flow |
| Graph index | Wikilinks + folder conventions | Copilot traverses references naturally |
| Local search | GitHub search + Copilot context | Team-wide retrieval |
| Single frontmatter schema | Shared schema (see [`schema/`](schema/)) | Consistent structured queries |

## Directory Structure

```
spaces/
├── README.md                    # You are here
├── copilot-instructions.md      # Instructions Copilot follows in this Space
├── CONTRIBUTING.md              # How to add/edit knowledge
├── schema/
│   ├── frontmatter.md           # YAML frontmatter conventions
│   └── folder-conventions.md    # Folder organization rules
├── knowledge/
│   ├── customers/               # Customer context files
│   ├── people/                  # Stakeholder & contact notes
│   ├── meetings/                # Meeting notes & action items
│   ├── playbooks/               # Role-specific operational guides
│   └── weekly/                  # Weekly digest summaries
└── roles/
    ├── specialist.md            # STU role context
    ├── solution-engineer.md     # SE role context
    ├── csa.md                   # CSA role context
    └── csam.md                  # CSAM role context
```

## Quick Start

1. **Reference this repo** in your Copilot Space configuration
2. **Add customer context** — copy `knowledge/customers/_template.md`, fill in details
3. **Log meetings** — use `knowledge/meetings/_template.md` for consistent capture
4. **Consult your role** — check `roles/` for role-specific guidance Copilot will use

## Design Principles

1. **Git is the write gate.** Every knowledge change flows through a PR. Branch protection + review = human-in-the-loop confirmation.
2. **Frontmatter enables queries.** Consistent YAML headers let Copilot filter and scope context (e.g., "show me all meetings for Contoso tagged `risk`").
3. **Wikilinks connect the graph.** Use `[[Customer Name]]` and `[[Person Name]]` to create traversable relationships.
4. **Roles scope advice.** Copilot reads role files to tailor guidance — a Specialist sees pipeline-building patterns, a CSAM sees governance cadences.
5. **Templates enforce consistency.** Every note type has a template. Copy it, fill it, PR it.
