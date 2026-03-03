---
description: "Sync project notes with the linked GitHub repo — pull recent commits, PRs, issues, and README updates into the Obsidian vault."
---

# Sync Project from GitHub

Keep an Obsidian project note in sync with its linked GitHub repository. Read-only — pulls repo activity into the vault, never pushes.

## Workflow

### Step 1 — Read Project Note

- `read_note` on `Projects/<Name>.md` → get the `repo` field from frontmatter.
- If no `repo` field, ask the user for the repo URL.

### Step 2 — Query GitHub

Use MCP GitHub tools to retrieve:
- **Recent commits** (last 14 days): notable changes, authors.
- **Open PRs**: title, author, status, review state.
- **Open Issues**: title, labels, assignees.
- **README/docs changes**: architecture or setup updates.

### Step 3 — Update Vault

Use `patch_note` to append or update the `## GitHub Activity` section on the project note:
- `patch_note({ path: "Projects/<Name>.md", operation: "append", heading: "GitHub Activity", content: "..." })`
- If the section already exists with a previous sync, replace it by reading the note, removing the old section, and writing back with `write_note`.
- Update `last_synced` in frontmatter via `update_frontmatter`.

## Output Format

Append to the project note:

```markdown
## GitHub Activity

*Last synced: {YYYY-MM-DD}*

### Recent Commits (Last 14 Days)

- `{short hash}` {commit message} — @{author} ({date})
- `{short hash}` {commit message} — @{author} ({date})

### Open Pull Requests

- **#{num}** {title} — @{author} ({status})

### Open Issues

- **#{num}** {title} — {labels} ({assignee})

### Documentation Changes

- {summary of README or docs changes, or "No changes"}
```

## Input

{user provides project name or repo URL}
