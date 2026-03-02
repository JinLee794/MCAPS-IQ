---
description: "Generate a weekly digest summarizing meetings, action items, project updates, and CRM health for tracked customers."
---

# Weekly Digest

Generate a weekly digest by aggregating vault activity and CRM state across tracked customers. Output is both human-readable and saved to the vault for retrieval.

## Workflow

### Step 1 — Scope the Week

Determine the target week (default: current week, Mon–Fri).

### Step 2 — Gather Vault Data

- `search_notes({ query: "" })` scoped to `Meetings/` → filter to notes with `date` within the target week.
- `read_multiple_notes` on the matched meetings → extract summaries, action items, customers, projects.
- `list_directory({ path: "Projects/" })` → read any project notes modified this week.
- `list_directory({ path: "Customers/" })` → get the active customer roster.

### Step 3 — M365 Activity via WorkIQ

Use `ask_work_iq` to surface meetings, emails, and chats that may not have corresponding vault notes:

**Query 1 — Meeting activity:**
> "List all meetings I attended this week ({Monday date} to {Friday date}). For each, provide the date, attendees, customer/project if identifiable, and a one-line summary."

**Query 2 — Email/chat threads with tracked customers:**
> "Summarize email threads and Teams messages with {customer roster} from {Monday} to {Friday}. Highlight any decisions, asks, or commitments made."

**What to capture:**
- Meetings that happened but don't have a vault meeting note → flag as **uncaptured meetings** in the digest.
- Email/chat decisions or commitments that should be tracked as action items.
- Customer engagement frequency — which tracked customers had zero M365 touchpoints this week (engagement gap signal).

### Step 4 — CRM Health Check

For each tracked customer touched this week:
- `list_opportunities({ customerKeyword: "<customer>" })` → current pipeline state.
- `find_milestones_needing_tasks({ customerKeywords: ["<customers>"] })` → milestone hygiene.
- Surface any risks: overdue milestones, milestones without tasks, stale opportunities.

### Step 5 — Write Digest to Vault

Use `write_note` to save to `Weekly/<YYYY>-W<XX>.md`.

## Frontmatter Schema

```yaml
tags:
  - weekly-digest
date: YYYY-MM-DD          # Friday of the week
week: YYYY-WXX
customers_touched: []     # Array of customer names
```

## Output Format

```markdown
---
tags:
  - weekly-digest
date: {YYYY-MM-DD}
week: {YYYY-WXX}
customers_touched:
  - {Customer A}
  - {Customer B}
---

# Weekly Digest — Week of {Monday date}

## Summary

- **{N}** meetings this week ({M} with vault notes, {K} uncaptured)
- **{N}** action items created
- **{N}** tasks completed
- **Customers touched:** [[{Customer A}]], [[{Customer B}]]
- **Customers with no touchpoints:** [[{Customer C}]]

## Meetings

| Date | Meeting | Customer | Source | Summary |
|---|---|---|---|---|
| {date} | [[{meeting title}]] | [[{customer}]] | Vault | {summary} |
| {date} | {meeting title} | {customer} | WorkIQ | {summary — no vault note} |

## Uncaptured Meetings

Meetings found via WorkIQ with no corresponding vault note:
- **{date}**: {meeting title} with {attendees} — {summary from transcript}

## M365 Highlights

Key decisions or commitments surfaced from email and chat threads this week:
- {Decision/commitment from email} — {customer/project}, {date}
- {Open thread requiring follow-up} — {customer/project}

## Action Items Created

- [ ] {action} ([[{owner}]]) — from [[{meeting}]]

## Completed This Week

- [x] {completed task} — from [[{source}]]

## Customer Health

### [[{Customer A}]]

- **Pipeline:** {opportunity count}, {total pipeline value}
- **Milestones:** {active count}, {at risk count}
- **Risks:** {any overdue milestones, missing tasks, stale opportunities}

### [[{Customer B}]]

- ...

## Active Projects

### [[{Project 1}]]

- {what happened this week}

## Carry-Forward / Blockers

- {item that needs attention next week}

## Next Week's Focus

- {priority 1}
- {priority 2}
```

## Input

{user can optionally specify which week, defaults to current week}
