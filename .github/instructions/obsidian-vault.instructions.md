---
description: "Obsidian vault integration — local knowledge layer, customer roster, durable storage, CRM prefetch context, Connect hook routing. Use when reasoning about vault reads, customer defaults, durable memory, Obsidian notes, OIL tools, customer roster filtering, vault-first storage, or cross-medium context assembly."
applyTo: "mcp/oil/**"
---

# Obsidian Vault — Local Knowledge Layer

The Obsidian vault is the agent's **primary local knowledge store** — personal notes, customer context, durable memory, and known defaults. It is NOT optional scaffolding; it is the lens through which CRM data is scoped and interpreted.

MSX/CRM is the **authoritative system of record** for live state (milestones, opportunities, pipeline). The vault provides the *context* that makes CRM data meaningful: which customers matter, what was discussed, what decisions were made, what the agent should focus on.

## Core Principles

1. **Vault defines scope; CRM provides fresh state.** The vault tells the agent *who* and *what* to care about. CRM tells the agent *where things stand right now*.
2. **Vault-listed customers are the active roster.** If a customer does not have a `Customers/<Name>.md` file in the vault, treat it as out-of-scope for proactive workflows. Past/completed/limbo opportunities for un-tracked customers should be ignored unless the user explicitly asks.
3. **CRM data is always retrieved fresh for complex operations.** Even if the vault has cached findings, milestone/opportunity status must be validated from CRM when the workflow involves writes, risk assessment, governance reporting, or cross-customer analysis.
4. **Vault is the durable storage layer.** Validated findings, decisions, Connect hooks, and agent insights are persisted to the vault. Without the vault, the agent operates statelessly — durable memory requires Obsidian or a user-configured persistence layer.

## Vault Structure Conventions

```
Customers/
  <CustomerName>.md       # One file per actively-tracked customer
People/
  <Full Name>.md          # Contact/stakeholder notes (internal, customer, partner)
Projects/
  <ProjectName>.md        # Cross-customer or internal projects
Meetings/
  <YYYY-MM-DD> - <Title>.md  # Meeting notes, organized by date
Daily/
  <YYYY-MM-DD>.md         # Daily notes (optional)
Weekly/
  <YYYY>-W<XX>.md         # Weekly digest summaries
Templates/
  ...                     # Note templates
```

### Nested vs Flat Customer Layout

The vault supports two customer layouts, but **nested is strongly preferred**:

| Layout | Path | Sub-entities | Status |
|---|---|---|---|
| **Nested** (preferred) | `Customers/X/X.md` | `opportunities/`, `milestones/` subdirs available | Default for new customers |
| **Flat** (legacy) | `Customers/X.md` | Cannot store sub-entity notes | Migration recommended |

**Why nested matters**: Operations like `oil_create_opportunity`, `oil_create_milestone`, and entity-level notes require the nested structure (`Customers/X/opportunities/`, `Customers/X/milestones/`). Flat-layout customers cannot use these features.

**Migration protocol**: When the agent encounters a flat-layout customer file during any workflow:
1. **Detect**: `check_vault_health()` reports flat-layout customers in `structuralIssues`.
2. **Propose**: Call `migrate_customer_structure({ customer: "X" })` — this generates a gated diff showing the move.
3. **Confirm**: The user reviews and confirms the migration. Content is preserved as-is.
4. **Post-migration**: Sub-entity directories become available for `oil_create_opportunity` / `oil_create_milestone`.

**When to trigger migration automatically**:
- Before `oil_create_opportunity` or `oil_create_milestone` — if the target customer uses flat layout, propose migration first.
- During `check_vault_health()` — flat-layout customers are surfaced as structural issues.
- During VAULT-HYGIENE phase — include structural migration in the recommended actions.

**Do NOT migrate** without user confirmation — file moves are gated writes.

### Frontmatter Conventions

All note types use YAML frontmatter for structured retrieval via `query_notes` or `search_vault`. Consistent keys enable cross-note queries.

| Key | Used In | Type | Purpose |
|---|---|---|---|
| `tags` | All | `string[]` | Note type classification (`meeting`, `people`, `project`, `customer`, `weekly-digest`) |
| `date` | Meetings, Weekly, Daily | `string` | ISO date (`YYYY-MM-DD`) |
| `customer` | Meetings, Projects | `string` | Customer name — must match a `Customers/` filename |
| `project` | Meetings | `string` | Project name — must match a `Projects/` filename |
| `status` | Meetings, Projects | `string` | `open` / `closed` / `active` / `completed` |
| `action_owners` | Meetings | `string[]` | People with outstanding action items |
| `company` | People | `string` | Organization the person belongs to |
| `org` | People | `string` | `internal` / `customer` / `partner` |
| `customers` | People | `string[]` | Customer accounts they're associated with |

### Customer File Anatomy (`Customers/<Name>.md`)

Each customer file is the single source of local truth for that customer. Sections are additive — create them as content arrives, don't pre-populate empty headings.

| Section | Purpose |
|---|---|
| `# <CustomerName>` | Header — customer name |
| `## Team` | Account team members, roles, stakeholder contacts |
| `## Opportunities` | **Summary index** of active opportunities (names with `[[wikilinks]]` to sub-notes). Canonical data lives in entity sub-notes — see below. |
| `## Milestones` | **Summary index** of tracked milestones. Canonical data lives in milestone sub-notes. |
| `## Agent Insights` | Validated findings promoted from working memory |
| `## Connect Hooks` | Evidence capture entries (see Connect Hooks schema) |
| `## Notes` | Free-form meeting notes, decisions, observations |

### Entity Sub-Notes (Source of Truth)

The canonical structured data for opportunities and milestones lives in **sub-notes under the customer directory**, not in the customer file sections:

| Entity | Path | Created by | Read by |
|---|---|---|---|
| Opportunity | `<customersRoot>/<Customer>/<opportunitiesSubdir>/<Name>.md` | `oil_create_opportunity` | `oil_get_opportunity_context`, `get_customer_context` |
| Milestone | `<customersRoot>/<Customer>/<milestonesSubdir>/<Name>.md` | `oil_create_milestone` | `oil_get_milestone_context`, `get_customer_context` |

Paths are config-driven (see `oil.config.yaml` `schema.customersRoot`, `schema.opportunitiesSubdir`, `schema.milestonesSubdir`). Defaults: `Customers/<Name>/opportunities/<OppName>.md`, `Customers/<Name>/milestones/<MsName>.md`.

Each sub-note has typed YAML frontmatter (e.g., `guid`, `status`, `stage`, `owner`, `salesplay`, `last_validated` for opportunities). This frontmatter is what `oil_get_opportunity_context` / `oil_get_milestone_context` / `prepare_crm_prefetch` read — not the customer file section text.

The `## Opportunities` and `## Milestones` sections in the customer file serve as a **human-readable index** — wikilinks to the sub-notes. They are NOT the source of truth for IDs or status.

#### Wikilink Conventions for Entity Sub-Notes

Entity sub-notes use a **dual representation** for people and relationships — plain strings in frontmatter (for programmatic queries) and `[[wikilinks]]` in the note body (for Obsidian graph connectivity):

| Field | Frontmatter (queryable) | Body (graph-linked) |
|---|---|---|
| Customer | `customer: Contoso` | `**Customer:** [[Contoso]]` |
| Opportunity owner | `owner: Alice Smith` | `- **Owner:** [[Alice Smith]]` |
| Milestone owner | `owner: Bob Chen` | `- **Owner:** [[Bob Chen]]` |
| Linked opportunity | `opportunity: Azure Migration` | `- **Opportunity:** [[Azure Migration]]` |

**Why dual representation**: Frontmatter must stay as plain strings so `query_notes`, `oil_get_opportunity_context`, and `prepare_crm_prefetch` can read them without stripping brackets. The body wikilinks create Obsidian graph edges so that navigating from a person → their milestones, or from a customer → their opportunities, works via the graph and backlinks panel.

**Naming rule for owners**: The `owner` value MUST match a `People/<Name>.md` filename exactly (e.g., `Alice Smith`, not `alice.smith@microsoft.com` or `Smith, Alice`). This enables:
- `[[Alice Smith]]` in the body to resolve to the People note
- `query_notes({ where: { owner: "Alice Smith" } })` to find all entities they own
- `get_person_context("Alice Smith")` → backlinks show all their opportunities/milestones

When syncing from CRM, resolve the CRM owner display name to the vault People note name. If no People note exists for that person, create one via `write_note` (gated) before referencing them as owner.

**ID Storage Rule**: MSX identifiers (opportunity GUIDs, account IDs, TPIDs, milestone numbers) belong in **entity sub-note frontmatter** — this is where VAULT-PREFETCH reads them. Account-level IDs (`tpid`, `accountid`) belong in the **customer file frontmatter**. The customer file sections are for narrative context, not structured ID storage. An opportunity sub-note without a `guid` in its frontmatter is incomplete.

> **Migration note**: If the customer file has inline GUIDs in `## Opportunities` (legacy pattern) but no sub-notes exist, create the sub-notes via `oil_create_opportunity` per entity, then simplify the section to wikilinks.

### OIL Tool Reference

The vault is managed by the **Obsidian Intelligence Layer (OIL)** MCP server (`oil`). OIL provides 22 domain-specific tools organized into four categories:

#### Orient (read-only context)

| Operation | Tool | Key Parameters |
|---|---|---|
| Vault map & health | `get_vault_context` | *(none)* — returns folder tree, note count, top tags, active customers. **Call first in any new session.** |
| Customer context | `get_customer_context` | `customer` — returns assembled context: opportunities (with GUIDs), team, meetings, action items, insights |
| Opportunity context | `oil_get_opportunity_context` | `customer` — returns all opportunities as structured data (frontmatter: GUID, status, stage, owner, salesplay). Prefer sub-notes; falls back to section parsing. |
| Milestone context | `oil_get_milestone_context` | `customer` — returns all milestones as structured data (frontmatter: ID, number, status, date, owner, linked opportunity). Prefer sub-notes; falls back to section parsing. |
| Person context | `get_person_context` | `person` — returns person profile, customer associations, org type, linked notes |
| Graph traversal | `query_graph` | `path`, `direction`, `depth`, `filter` — backlinks, forward links, N-hop neighborhood |
| People→Customer batch | `resolve_people_to_customers` | `people` array — batch-resolves person names to customer associations |

#### Retrieve (search/query)

| Operation | Tool | Key Parameters |
|---|---|---|
| Unified search | `search_vault` | `query` — 3-tier search: lexical → fuzzy → semantic. Ranked results with scores |
| Frontmatter query | `query_notes` | `where`, `and`, `or`, `order_by`, `limit` — SQL-like frontmatter query |
| Find similar | `find_similar_notes` | `path` or `text` — similarity by tags or semantic embeddings |

#### Write (gated modifications)

| Operation | Tool | Gate | Key Parameters |
|---|---|---|---|
| Append to section | `patch_note` | Auto / Gated | `path`, `heading`, `content`, `operation` — auto-confirmed for "Agent Insights", "Connect Hooks" |
| Connect evidence | `capture_connect_hook` | Auto | `customer`, `hook` — appends to customer file + backup |
| Audit trail | `log_agent_action` | Auto | `action`, `detail` — writes to `_agent-log/` |
| Meeting note | `draft_meeting_note` | Gated | `customer`, `date`, `attendees` — generates from template |
| Update customer | `update_customer_file` | Gated | `customer`, `section`, `content` — proposes frontmatter/section changes |
| Create customer | `create_customer_file` | Gated | `customer` — scaffolds new customer file |
| Write note | `write_note` | Gated | `path`, `content` — low-level write, always gated |
| Batch tags | `apply_tags` | Gated | `paths`, `action`, `tags` — batch tag add/remove |
| Scaffold opportunity | `oil_create_opportunity` | Gated | `customer`, `name`, `guid`, `status`, `stage`, `owner`, `salesplay` — creates sub-note at `<customersRoot>/<Customer>/<opportunitiesSubdir>/<Name>.md` with typed frontmatter |
| Update opportunity | `oil_update_opportunity` | Gated | `customer`, `name`, `fields` — updates frontmatter on an existing opportunity sub-note. Auto-sets `last_validated`. |
| Scaffold milestone | `oil_create_milestone` | Gated | `customer`, `name`, `milestoneid`, `number`, `status`, `milestonedate`, `owner`, `opportunity` — creates sub-note at `<customersRoot>/<Customer>/<milestonesSubdir>/<Name>.md` |
| Update milestone | `oil_update_milestone` | Gated | `customer`, `name`, `fields` — updates frontmatter on an existing milestone sub-note |
| Migrate structure | `migrate_customer_structure` | Gated | `customer` (optional) — detects flat-layout customers and proposes move to nested layout. Omit `customer` to scan all. |
| Manage pending | `manage_pending_writes` | — | `action` — list, confirm, or reject queued writes |

#### Composite (multi-step workflows)

| Operation | Tool | Key Parameters |
|---|---|---|
| CRM prefetch | `prepare_crm_prefetch` | `customers` array — extracts GUIDs/TPIDs and returns pre-built OData filter strings |
| Entity correlation | `correlate_with_vault` | `entities` — batch-resolves external entities (people, meetings) against vault notes |
| Promote findings | `promote_findings` | `findings` array — batch-promotes validated findings to customer files |
| Vault health | `check_vault_health` | *(none)* — surfaces stale insights, missing IDs, incomplete sections, orphaned notes, **and structural layout issues** (flat-layout customers needing migration) |
| Drift report | `get_drift_report` | *(none)* — compares vault snapshots against expected CRM state |

## Vault Protocol Phases

Skills reference these phases by name (e.g., "run VAULT-PREFETCH") instead of duplicating vault logic. Each phase includes an **availability guard** — if OIL is unreachable, the phase is skipped gracefully and the workflow continues with fallback behavior.

### Availability Guard (all phases)

Before executing any vault phase:
1. Attempt `get_vault_context()` — this returns the vault map (folder tree, note count, top tags, active customers).
2. If reachable → proceed with the phase.
3. If unreachable → skip the phase, apply the phase-specific fallback, and continue the workflow without breaking.

Cache the availability result for the duration of the current workflow — do not re-check on every phase invocation within the same turn.

### VAULT-PREFETCH

**When**: Before any CRM query or multi-customer workflow. **This is mandatory when OIL is available** — do not skip it in favor of going directly to CRM tools.
**Purpose**: Resolve customer→MSX identifiers from vault notes so CRM queries use precise IDs instead of broad discovery.

Steps:
1. Run availability guard.
2. Call `get_vault_context()` to identify the active customer roster.
3. If targeting a specific customer, call `get_customer_context({ customer: "<Name>" })` — this returns assembled context in one call:
   - **Opportunity GUIDs** (e.g., `opportunityid: 00000000-0000-0000-0000-000000000000`). These go directly into CRM `$filter` expressions (`_msp_opportunityid_value eq '<GUID>'`).
   - **Account TPID / Account ID** — use for account-scoped CRM filters.
   - **Milestone IDs or numbers** if previously recorded.
   - **Team composition** — identifies relevant owners for `_ownerid_value` filters.
   - **Prior Agent Insights** — avoid re-running queries for already-validated findings.
4. For CRM-ready OData filters, use `prepare_crm_prefetch({ customers: ["<Name>"] })` — returns pre-built filter strings ready to paste into `crm_query`.
5. For multi-customer workflows, call `prepare_crm_prefetch({ customers: ["Contoso", "Fabrikam", ...] })` to collect all relevant IDs in one pass.

**Critical rule**: If the vault has the opportunity GUID for a customer, use it directly. Do NOT call `list_opportunities({ customerKeyword })` or `crm_query` on `accounts` to rediscover an ID the vault already provides.

**Skip when**: User provides an explicit opportunity/milestone ID, or asks to search beyond tracked customers.
**Fallback (no vault)**: Ask user for customer names, or use `crm_whoami` + `get_my_active_opportunities()` for scope.

### VAULT-CORRELATE

**When**: After retrieving M365/WorkIQ evidence or CRM data that may relate to existing vault notes (meetings, decisions, action items).
**Purpose**: Cross-reference retrieved activities with vault notes for richer context, and resolve people/entities to customer associations.

Steps:
1. Run availability guard.
2. **People→Customer resolution**: Call `resolve_people_to_customers({ people: [...] })` to batch-resolve person names to customer associations. This enables attributing M365 activity (meetings, chats, emails) to specific customer accounts based on who participated.
3. For richer correlation, call `correlate_with_vault({ entities: [...] })` — batch-resolves external entities (people, meetings from M365) against vault notes with confidence scoring.
4. Search vault by customer name and date range using `query_notes` (frontmatter `customer` + `date` fields). Use resolved customer names from step 2 to target searches.
5. Surface connections: prior meeting notes, decisions, and action items that relate to the retrieved evidence.
6. Return the people→customer lookup to the calling workflow for downstream attribution (e.g., WorkIQ entity resolution, output grouping by customer).

**Date/time boundary rules**:
- Always scope vault searches to the **same date window** as the source query (e.g., if WorkIQ was scoped to today, search vault for today's date only).
- Never let vault correlation silently expand the time window — if a broader search is needed, state the expanded range explicitly to the user.
- Use ISO date format (`YYYY-MM-DD`) in all time-based vault queries.

**Skip when**: No M365/WorkIQ evidence was retrieved, or vault context wouldn't add value to the current output.
**Fallback (no vault)**: Skip correlation; present M365/CRM evidence as-is without vault enrichment.

### VAULT-PROMOTE

**When**: After completing a CRM query or write workflow with validated findings worth persisting.
**Purpose**: Persist validated findings to the vault for future context.

Steps:
1. Run availability guard.
2. Use `promote_findings()` to batch-promote validated findings to customer files. This auto-confirms for designated sections ("Agent Insights", "Connect Hooks") and gates other sections for review.
3. Include datestamp (`YYYY-MM-DD`) and brief summary of what was found or changed.
4. If no customer file exists and the customer is now actively tracked, use `create_customer_file({ customer: "<Name>" })` to scaffold it with the findings.
5. For Connect hooks: use `capture_connect_hook({ customer: "<Name>", hook: { ... } })` — this appends to the customer file and creates a backup automatically.

**Do NOT promote**: speculative, unvalidated, or redundant information.
**Fallback (no vault)**: Write to `.connect/hooks/hooks.md` only. Durable memory is not available without a configured persistence layer.

### VAULT-SYNC

**When**: After a CRM retrieval returns entity data (opportunities, milestones) that should be persisted to the vault — either for a new customer onboarding, periodic refresh, or drift remediation.
**Purpose**: Populate or refresh vault sub-notes with structured CRM entity data using the entity-aware write tools.

Steps:
1. Run availability guard.
2. **Read vault state first**: Call `oil_get_opportunity_context({ customer })` and/or `oil_get_milestone_context({ customer })` to get the current vault entities.
3. **Diff against CRM results**: Compare vault entities (by GUID / milestone ID) against the CRM data you just retrieved. Classify each entity as: **new** (in CRM, not in vault), **changed** (in both but fields differ), or **current** (no update needed).
4. **Ensure nested layout**: If the target customer uses flat layout (`Customers/X.md`), call `migrate_customer_structure({ customer })` first. Entity sub-notes require the nested layout.
5. **Loop entity writes**:
   - For each **new** opportunity: `oil_create_opportunity({ customer, name, guid, status, stage, owner, salesplay })`
   - For each **changed** opportunity: `oil_update_opportunity({ customer, name, fields: { ... } })`
   - For each **new** milestone: `oil_create_milestone({ customer, name, milestoneid, number, status, milestonedate, owner, opportunity })`
   - For each **changed** milestone: `oil_update_milestone({ customer, name, fields: { ... } })`
6. **Confirm gated writes**: All entity writes are gated. Call `manage_pending_writes({ action: "list" })` to review the batch, then confirm.
7. **Update customer file index** (optional): After entity sub-notes are created, update `## Opportunities` / `## Milestones` sections with wikilinks to the new sub-notes via `update_customer_file`.

**Critical rules**:
- **One tool call per entity** — loop `oil_create_opportunity` per CRM opportunity. Do NOT aggregate into a single `write_note` or `update_customer_file` call.
- **Never build markdown manually** — the entity tools handle frontmatter schema, path resolution, and gating. Manual markdown bypasses all of this.
- **Diff before writing** — don't recreate entities that already exist in vault. Use GUID/milestone-ID matching to skip unchanged entities.
- For large syncs (>20 entities), confirm with the user before executing the batch.

**Skip when**: CRM data was read-only (no intent to persist), or the user explicitly wants a transient lookup.
**Fallback (no vault)**: Cannot sync — CRM remains the only source. Note the gap to the user.

### Vault Write Patterns (Good vs Bad)

| Pattern | Status | Why |
|---|---|---|
| Loop: `oil_create_opportunity` per CRM opp, `oil_create_milestone` per CRM ms | ✅ Correct | Proper sub-notes with typed frontmatter; gated |
| `oil_get_opportunity_context` → diff → only write **new/changed** entities | ✅ Correct | Avoids redundant writes; idempotent |
| `oil_update_opportunity({ fields: { status, stage } })` to refresh stale data | ✅ Correct | Preserves sub-note structure; stamps `last_validated` |
| `update_customer_file({ sections: { "Opportunities": raw_markdown } })` | ⚠️ Fragile | Loses frontmatter structure; only use for the summary index, not entity data |
| `write_note` with manually assembled opportunity markdown | ❌ Bypasses | Skips entity-aware tools; no typed frontmatter; no GUID indexing |
| Shell script / Python to build `.md` files and write to vault directory | ❌ Bypasses | Skips OIL gating entirely; no audit log; no diff review |
| Single `patch_note` with a table of all opportunities | ❌ Unstructured | Not queryable by frontmatter; no per-entity lifecycle |

### VAULT-HYGIENE

**When**: Periodic review, governance cadence, or on-demand cleanup.
**Purpose**: Keep vault data current and aligned with CRM reality.

Steps:
1. Run availability guard.
2. Call `check_vault_health()` — this surfaces stale insights, missing IDs, incomplete sections, orphaned notes, **and structural layout issues** in one call.
3. **If `structuralIssues` is non-empty**: Present flat-layout customers to the user and offer `migrate_customer_structure()` to convert them to nested layout. This is a prerequisite for sub-entity storage (opportunities, milestones).
4. Cross-reference the vault health report with `get_my_active_opportunities()` — flag gaps (CRM customers not in vault, vault customers with no active CRM opps).
5. For deeper analysis, call `get_drift_report()` to compare vault snapshots against expected CRM state.
6. Recommend additions/removals to the user — do not auto-delete vault content.

**Skip when**: Not explicitly requested or not part of a governance cadence.
**Fallback (no vault)**: Ask the user for customer names or use `crm_whoami` context. No automatic roster approximation without a configured persistence layer.

## Quick Reference: Vault–CRM Interaction Patterns

> Skills should invoke the named Vault Protocol Phases above. This section provides a condensed lookup for common patterns.

| Scenario | Phase | Key Pattern |
|---|---|---|
| Before any CRM query | VAULT-PREFETCH | `get_customer_context` → extract GUIDs → CRM `$filter` |
| After M365/WorkIQ retrieval | VAULT-CORRELATE | `resolve_people_to_customers` → `correlate_with_vault` |
| After validated CRM findings | VAULT-PROMOTE | `promote_findings` → customer file `## Agent Insights` |
| Connect evidence capture | VAULT-PROMOTE | `capture_connect_hook` → customer file + backup |
| Multi-customer scope | VAULT-PREFETCH | Vault roster → `prepare_crm_prefetch` → scoped CRM queries |
| CRM → vault entity sync | VAULT-SYNC | `oil_get_opportunity_context` → diff vs CRM → loop `oil_create_opportunity` / `oil_update_opportunity` per entity |
| Periodic cleanup | VAULT-HYGIENE | `check_vault_health` → `get_drift_report` → user review |

**Freshness rule**: Use vault for *who/what/why* context. Use CRM for *current state*. Vault scopes first, CRM validates second.

**Customer roster rule**: Vault-listed customers are the active scope for proactive workflows. Un-tracked customers are excluded unless the user explicitly asks.

## Fallback Behavior (No Vault)

> The Vault Protocol Phases above include per-phase fallback instructions. This section provides the consolidated fallback reference.

When OIL is unreachable (availability guard fails):
- The agent operates **statelessly** — no persistent memory across sessions. CRM remains the source of truth for live state.
- CRM query scoping reverts to asking the user for customer names or using `crm_whoami` context.
- Connect hooks go to `.connect/hooks/hooks.md` only.
- Vault correlation (VAULT-CORRELATE) is skipped — present M365/CRM evidence without vault enrichment.
- Users who want cross-session persistence without Obsidian can configure their own memory layer (local files, another MCP server, etc.). The agent does not assume any specific fallback directory structure.

## Anti-Patterns

- **Treating vault as optional** — when configured, it IS the local knowledge layer. Don't ignore it and query CRM blind.
- **Stale vault over fresh CRM** — vault context is for scoping and narrative. Never use cached vault data as a substitute for live CRM status when accuracy matters.
- **Querying all CRM data without vault scoping** — if the vault has a customer roster, use it. Don't `get_milestones(mine: true)` to retrieve everything when the vault tells you which 5 customers matter.
- **Promoting unvalidated data to vault** — only write confirmed findings, decisions, and evidence to vault files. Working hypotheses should be discarded at session end, not persisted.
- **Creating vault files for transient customers** — only create `Customers/<Name>.md` for customers the user intends to actively track. One-off CRM lookups don't warrant a vault file unless the user says so.
