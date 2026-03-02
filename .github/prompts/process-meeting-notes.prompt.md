---
description: "Structure raw meeting notes, transcripts, or screenshots into a formatted Obsidian meeting note with frontmatter, action items, and wiki-links. Updates related vault notes."
---

# Process Meeting Notes

Structure raw meeting input (transcript, pasted notes, screenshot text, or Copilot recap) into a complete meeting note and update related vault notes.

## Workflow

### Step 1 — Resolve Vault References

Before processing content, resolve names against the vault:
- `list_directory({ path: "Customers/" })` → match any mentioned customer.
- `list_directory({ path: "Projects/" })` → match any mentioned project.
- `list_directory({ path: "People/" })` → identify which attendees already have notes.

### Step 2 — Extract & Structure

From the raw input, extract:
- **Date** → `date` frontmatter field (YYYY-MM-DD)
- **Customer** → match to `Customers/` filename for `customer` field
- **Project** → match to `Projects/` filename for `project` field
- **Summary** → one sentence capturing the core outcome
- **Attendees** → `[[wiki-links]]` to People notes
- **Action items** → checkboxes with `([[Owner]])` attribution
- **Key decisions** → bullet list with rationale
- **Technologies** → Azure services, frameworks, tools mentioned

### Step 3 — Write the Meeting Note

Use `write_note` to save to `Meetings/<YYYY-MM-DD> - <Meeting Title>.md`.

### Step 4 — Enrich with M365 Context via WorkIQ

If the meeting involved a tracked customer or project, use `ask_work_iq` to cross-reference:

**Query — Meeting transcript/recording:**
> "Find the transcript or Copilot recap for the meeting on {date} with {attendees or customer}. Extract any action items, decisions, or follow-ups not captured in the raw notes."

**Query — Related threads (if gaps exist):**
> "Find email or Teams messages about {topic/customer} from the past 7 days that provide context for decisions made in this meeting."

**What to enrich:**
- Fill in action items or decisions that were in the transcript but missing from raw notes.
- Add context for decisions by referencing prior email/chat threads.
- Flag any commitments made in the meeting that contradict or update prior email/chat agreements.

### Step 5 — Update Related Notes

After writing the meeting note:
1. **Customer file**: If a tracked customer was discussed, use `patch_note` to append a brief entry under `## Notes` on `Customers/<Name>.md` with the meeting date and key takeaways.
2. **New people**: List any attendees without a `People/` note. Offer to create them using the `create-person` prompt.
3. **Action items**: If action items reference a project, use `patch_note` to append them to the project's `## Open Items` section.

## Frontmatter Schema

```yaml
tags:
  - meeting
date: YYYY-MM-DD
customer:        # Matches Customers/ filename — empty if internal-only
project:         # Matches Projects/ filename — empty if N/A
summary:         # One sentence
status: open     # open if unresolved action items, closed otherwise
action_owners:   # Array of people with action items
  - Person Name
```

## Body Template

```markdown
# {Meeting Title}

**Date:** [[{YYYY-MM-DD}]]
**Customer:** [[{Customer}]]
**Project:** [[{Project}]]

## Attendees

- [[Person 1]] — {role/company}
- [[Person 2]]

## Agenda

- {topic 1}
- {topic 2}

## Notes

**{Topic 1}**
- Key point
- Key point
- *Technologies:* {Azure services, frameworks}

**{Topic 2}**
- Key point

## Action Items

- [ ] {Action} ([[{Owner}]])
- [ ] {Action} ([[{Owner}]])

## Key Decisions

- {Decision 1}: {rationale}
- {Decision 2}
```

## New People Detected

If attendees don't have a `People/` note, list them:

```
> **New contacts to create:**
> - {Name} — {Title}, {Company}
```

## Input

{user provides raw notes, transcript, or screenshot text}
