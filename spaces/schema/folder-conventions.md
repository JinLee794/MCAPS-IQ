# Folder Conventions

The knowledge layer follows a flat-file structure within each category. Every folder serves a specific purpose.

## Folder Map

```
knowledge/
├── customers/      Customer account context (one file per customer)
├── people/         Stakeholder and contact notes
├── meetings/       Chronological meeting records
├── playbooks/      Role-specific operational guides
└── weekly/         Weekly digest summaries
```

## Naming Rules

| Folder | Pattern | Example |
|---|---|---|
| `customers/` | `<CustomerName>.md` | `Contoso.md` |
| `people/` | `<Full Name>.md` | `Alice Smith.md` |
| `meetings/` | `<YYYY-MM-DD> - <Title>.md` | `2026-03-01 - Contoso QBR.md` |
| `playbooks/` | `<descriptive-slug>.md` | `pipeline-qualification.md` |
| `weekly/` | `<YYYY>-W<XX>.md` | `2026-W09.md` |

## Customer File Evolution

Customer files can grow from simple context notes into rich account profiles:

```
Level 1 (new):     Basic frontmatter + team section
Level 2 (active):  + Opportunities section + wikilinks to meetings
Level 3 (mature):  + Agent Insights + Connect Hooks + risk history
```

All levels are valid. Don't pre-populate empty sections — add them as content arrives.

## Cross-Referencing

Use `[[wikilinks]]` to connect notes across folders:

- Customer file → `## Recent Meetings` section with `[[2026-03-01 - Contoso QBR]]`
- Meeting note → Attendees reference `[[Alice Smith]]`
- People file → `customers: [Contoso]` in frontmatter

This creates a traversable graph that Copilot can navigate to assemble multi-source context.

## Template Files

Each folder contains a `_template.md` file. Templates:
- Are never modified directly — copy them to create new notes
- Define the minimum required frontmatter and sections
- Include inline comments explaining each field
