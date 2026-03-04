# Frontmatter Schema

All knowledge files use YAML frontmatter for structured retrieval. This schema ensures consistency across team contributions.

## Universal Fields

These fields apply to all note types:

| Field | Type | Required | Description |
|---|---|---|---|
| `tags` | `string[]` | **Yes** | Classification tags for filtering |
| `date` | `string` | **Yes** | ISO date (`YYYY-MM-DD`) — creation or event date |
| `updated` | `string` | No | ISO date of last meaningful update |
| `author` | `string` | No | GitHub username of the contributor |
| `status` | `string` | No | `active` \| `closed` \| `draft` |

## Customer Files (`knowledge/customers/`)

```yaml
---
tags: [customer]
date: 2026-03-01
updated: 2026-03-01
tpid: ""              # Top Parent ID from CRM
account_id: ""        # CRM Account ID
industry: ""          # e.g., Financial Services, Healthcare
segment: ""           # Enterprise, SMB, etc.
team:                 # Account team members
  - name: ""
    role: ""          # Specialist, SE, CSA, CSAM
    alias: ""         # GitHub or corp alias
---
```

## People Files (`knowledge/people/`)

```yaml
---
tags: [people]
date: 2026-03-01
company: ""           # Organization name
org: ""               # internal | customer | partner
role: ""              # Job title or function
customers: []         # Associated customer accounts
preferences: ""       # Communication style notes
---
```

## Meeting Notes (`knowledge/meetings/`)

```yaml
---
tags: [meeting]
date: 2026-03-01
customer: ""          # Must match a customers/ filename
attendees: []         # List of attendee names
action_owners: []     # People with outstanding actions
status: open          # open | closed
risk_signals: []      # Any risks surfaced during the meeting
---
```

## Playbooks (`knowledge/playbooks/`)

```yaml
---
tags: [playbook]
date: 2026-03-01
role: ""              # Target role: specialist | se | csa | csam | all
stage: ""             # MCEM stage if applicable: 1 | 2 | 3 | 4 | 5
trigger: ""           # When to use this playbook
---
```

## Weekly Digests (`knowledge/weekly/`)

```yaml
---
tags: [weekly-digest]
date: 2026-03-01
week: "2026-W09"      # ISO week
highlights: []        # Key wins or progress
risks: []             # Items needing attention
next_actions: []      # Priorities for next week
---
```

## Tag Vocabulary

Use these standard tags for consistent filtering:

| Tag | When to use |
|---|---|
| `customer` | Customer context files |
| `people` | Stakeholder/contact files |
| `meeting` | Meeting notes |
| `playbook` | Reusable operational patterns |
| `weekly-digest` | Weekly summaries |
| `decision` | Contains a recorded decision |
| `risk` | Contains risk signals |
| `action-item` | Has outstanding action items |
| `blocker` | Blocked item needing escalation |
| `win` | Success evidence or positive outcome |
| `connect-hook` | Measurable impact evidence |
