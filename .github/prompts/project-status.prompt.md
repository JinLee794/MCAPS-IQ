---
description: "Generate a project status summary by reading the vault project note, related meetings, and validating against CRM."
---

# Summarize Project Status

Generate a project status summary by combining vault context with fresh CRM data.

## Workflow

### Step 1 — Read Vault Context

- `read_note` on `Projects/<Name>.md` → customer, type, priority, tech stack, open items, status.
- `search_notes({ query: "<project name>" })` scoped to `Meetings/` → recent meetings referencing this project.
- `read_multiple_notes` on the 3-5 most recent matches → extract activity, decisions, action items.

### Step 2 — M365 Evidence via WorkIQ

Use `ask_work_iq` to surface recent activity not captured in vault notes:

**Query 1 — Meeting activity:**
> "Summarize meetings about {project name} or with {customer} in the last 14 days. Include decisions, action items, and blockers discussed."

**Query 2 — Email & chat threads:**
> "Find email threads or Teams messages about {project name} in the last 14 days. Highlight any decisions, status updates, blockers, or asks."

**What to capture:**
- Activity that happened but has no vault meeting note (evidence gap).
- Decisions or commitments made in email/chat that should appear in the status report.
- Blockers or risks surfaced in informal channels.
- Source attribution: mark each data point as `(WorkIQ)` in the output.

### Step 3 — CRM Validation

If the project's customer is in the vault roster:
- `list_opportunities({ customerKeyword: "<customer>" })` → current opportunity status.
- Check milestone state for any opportunities tied to this project — use `crm_query` with appropriate filters.
- Surface any discrepancies between vault notes and CRM state (e.g., project note says "on track" but CRM milestone is overdue).

### Step 4 — Synthesize & Output

Combine vault + WorkIQ + CRM data into a scannable status report. Show the source of each data point (`Vault`, `WorkIQ`, `CRM`).

### Step 5 — Update Vault

Use `patch_note` to update `Projects/<Name>.md`:
- Append the generated status summary under `## Status History` with today's date.
- Update `status` frontmatter via `update_frontmatter` if it changed.

## Output Format

```markdown
## Status Summary — {Project Name}

*Generated: {YYYY-MM-DD}*
*Customer: [[{customer}]] | Type: {type} | Priority: {priority}*

### Current Status

{One sentence: where the project stands — sourced from vault + CRM}

### Recent Activity

- **{date}**: {what happened} — from [[{meeting note}]] `(Vault)`
- **{date}**: {what happened} — from email thread `(WorkIQ)`
- **{date}**: {what happened} — from Teams chat `(WorkIQ)`

### CRM State

- **Opportunity:** {name} — {stage}, {status}
- **Active Milestones:** {count} — {any at risk or overdue}

### Key Decisions

- {Decision 1}
- {Decision 2}

### Open Action Items

- [ ] {Action} ([[{Owner}]]) — from [[{source}]]

### Blockers & Risks

- {risk or blocker}

### Next Steps

- {next step 1}
- {next step 2}

### Technologies

{Azure services, frameworks, tools involved}
```

## Input

{user provides project name}
