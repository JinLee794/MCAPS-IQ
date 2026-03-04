# Contributing to the Team Knowledge Layer

This knowledge base is maintained collaboratively. Every team member can contribute — here's how.

## Workflow

1. **Branch** — Create a feature branch: `knowledge/<your-alias>/<topic>`
2. **Add/Edit** — Copy the appropriate template, fill in content
3. **PR** — Open a pull request. Tag relevant team members for review.
4. **Merge** — Once approved, merge to `main`. Copilot picks up changes immediately.

## What to Contribute

| You just... | Add this | Template |
|---|---|---|
| Had a customer meeting | Meeting note | `knowledge/meetings/_template.md` |
| Met a new stakeholder | People file | `knowledge/people/_template.md` |
| Started tracking a customer | Customer file | `knowledge/customers/_template.md` |
| Learned a reusable pattern | Playbook entry | `knowledge/playbooks/_template.md` |
| Completed a week | Weekly digest | `knowledge/weekly/_template.md` |

## Frontmatter Rules

- **Always include frontmatter.** Every file needs YAML frontmatter with at minimum `tags` and `date`.
- **Use consistent customer names.** Must match the filename in `knowledge/customers/`.
- **Tag appropriately.** Common tags: `meeting`, `decision`, `risk`, `action-item`, `blocker`, `win`.

## Wikilinks

Use `[[double brackets]]` to link related notes:
- `[[Contoso]]` links to the customer file
- `[[Alice Smith]]` links to the people file
- `[[2026-03-01 - Contoso QBR]]` links to a specific meeting

## Quality Standards

- **No empty files.** Every file should have meaningful content, not just frontmatter.
- **Action items need owners.** Use `action_owners` in frontmatter.
- **Dates are ISO format.** `YYYY-MM-DD` always.
- **One customer per file.** Don't combine multiple customers in a single note.

## Review Guidelines

When reviewing a PR:
- Check frontmatter completeness
- Verify customer name matches existing files
- Ensure wikilinks point to real files (or note if the target needs to be created)
- Flag any sensitive information that shouldn't be in git
