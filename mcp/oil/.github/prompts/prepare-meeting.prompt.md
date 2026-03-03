---
description: "Pre-populate a meeting note with context from the vault, CRM, and recent meetings — for proactive meeting prep."
---

# Prepare Meeting

Generate a pre-populated meeting note for an upcoming meeting. Pulls context from the vault and optionally CRM to surface relevant background, open items, and attendees.

## Workflow

### Step 1 — Identify Customer & Project

From the meeting title or user input, determine the customer and project.
- Use `list_directory({ path: "Customers/" })` to match the customer to a vault file.
- Use `list_directory({ path: "Projects/" })` to match the project.

### Step 2 — Gather Vault Context

Pull context using mcp-obsidian tools:
- `read_note` on `Customers/<Name>.md` → account summary, team, opportunities, recent notes.
- `read_note` on `Projects/<Name>.md` → current status, open items, tech stack.
- `search_notes({ query: "<customer or project name>" })` in `Meetings/` → last 3-5 related meetings.
- `read_multiple_notes` on the most recent related meetings → extract action items, decisions, attendees.

### Step 3 — M365 Context via WorkIQ

Use `ask_work_iq` to pull recent M365 activity with this customer/project. This surfaces signal that may not be in manually-created vault notes.

**Query 1 — Recent meetings & transcripts:**
> "Summarize meetings with {customer} or {attendees} in the last 14 days. Include key discussion points, decisions made, and any open questions."

**Query 2 — Email & chat threads (if relevant):**
> "Find recent email threads or Teams messages about {customer/project/topic} in the last 14 days. Summarize any decisions, asks, or blockers."

**What to surface in the meeting note:**
- Decisions or commitments made outside formal meetings (chat/email)
- Open questions or unresolved threads that should be on the agenda
- Recent meeting topics to avoid rehashing
- Any stakeholder changes or new participants in recent threads

### Step 4 — CRM Validation (if customer is tracked)

If the customer has a vault file with opportunity IDs:
- Use `list_opportunities({ customerKeyword: "<customer>" })` to get current opportunity status.
- Use `find_milestones_needing_tasks({ customerKeywords: ["<customer>"] })` if milestone context is relevant.
- This ensures the meeting prep reflects **current CRM state**, not stale vault notes.

### Step 5 — Write the Meeting Note

Use `write_note` to save to `Meetings/<YYYY-MM-DD> - <Meeting Title>.md`.

## Output Format

```markdown
---
tags:
  - meeting
date: {YYYY-MM-DD}
customer: {customer name — matches Customers/ filename}
project: {project name — matches Projects/ filename, or empty}
summary:
status: open
action_owners: []
---

# {Meeting Title}

**Date:** [[{YYYY-MM-DD}]]
**Customer:** [[{Customer}]]
**Project:** [[{Project}]]

## Pre-Meeting Context

> **Customer:** {brief customer context from vault}
> **Project Status:** {current project status from vault/CRM}
> **Last Meeting:** [[{last meeting}]] — {summary}

## Recent M365 Activity

> {Summary of relevant emails, chats, and meeting transcripts from WorkIQ — last 14 days}
> - {Notable decision or commitment from email/chat}
> - {Open thread or unresolved question to address}
> - {Any stakeholder change or new participant}

## Carried-Forward Action Items

- [ ] {open action from previous meeting} ([[{Owner}]])
- [ ] {open action from previous meeting} ([[{Owner}]])

## Suggested Agenda

1. Review action items from [[{last meeting}]]
2. {topic based on project/milestone status}
3. {topic based on open items}

## Attendees

- [[{Known Stakeholder 1}]] — {role}
- [[{Known Stakeholder 2}]] — {role}

## Notes

-

## Action Items

- [ ]

## Key Decisions

-
```

## Input

{user provides meeting title, and optionally customer/project name}
