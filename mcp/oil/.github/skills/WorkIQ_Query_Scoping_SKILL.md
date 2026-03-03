---
name: workiq-query-scoping
description: 'Scope broad WorkIQ requests into bounded, relevant retrieval across meetings, chats, email, and SharePoint/OneDrive content using a fact-map and two-pass retrieval strategy.'
argument-hint: 'Paste the user request and any known constraints (people, customer, time, source types, output needed)'
---

# WorkIQ Query Scoping

## Purpose
Convert broad WorkIQ asks into focused retrieval plans that minimize noise, latency, and accidental overreach while preserving user intent.

## MCP Tooling
- Primary retrieval tool: WorkIQ MCP `ask_work_iq`.
- If EULA is required by environment policy, complete acceptance before retrieval.
- Keep CRM reads/writes in `msx-crm`; use WorkIQ for M365 evidence retrieval only.
- **Seed fact map from CRM before retrieval**: call `get_my_active_opportunities(customerKeyword)` to resolve customer/opportunity context and populate entities, then use those names in WorkIQ queries for precise scoping.
- **Seed fact map from vault People notes**: before retrieval, query vault People notes (`search_notes` with tag `people`) to build a people→customer lookup. Use frontmatter fields `customers`, `company`, and `org` to pre-map known contacts to accounts. This enables automatic customer attribution when WorkIQ results mention those people.

## When to Use
- User asks for broad retrieval across Microsoft 365 sources (for example meetings + chats + files + emails).
- Request lacks clear boundaries (time window, entities, customer, project, or output type).
- User asks for “everything,” “all notes/transcripts,” or cross-workstream summaries.

## Source Types (M365)
- Teams chats/channels
- Meetings and transcripts/notes
- Outlook email and calendar context
- SharePoint/OneDrive files

## Fact Map Contract
Build a short fact map before retrieval:
1. Business goal (decision/output needed)
2. Source types (meetings, chat, email, SharePoint/OneDrive)
3. People/entities (names, team, account, opportunity, project)
4. **People→Customer map** (pre-resolved from vault People notes and CRM; see Entity Resolution below)
5. Time window (**explicit range — REQUIRED**; use ISO dates `YYYY-MM-DD`; if user says "today" use today's date only; never default to unbounded)
6. Topic constraints (keywords, product/workstream, customer)
7. Output shape (summary, action items, risks, decisions)

## Clarification Rules
- If 2 or more fact-map fields are missing, ask up to 3 focused clarifying questions.
- If user is unsure, apply safe defaults and confirm in one line:
  - Time: last 14 days
  - Sources: meetings + chats
  - Scope: named team/entities only
- If request appears cross-customer or sensitive, confirm scope boundaries before including content.

## Retrieval Strategy (Two Passes)
### Pass 1: Discovery
- Run narrow, low-cost retrieval to validate relevance.
- Prefer filters in this order: time window → entities → source types → keywords.
- **Date boundary enforcement**: Always include explicit date boundaries in every `ask_work_iq` prompt. Never let a query run without a stated time window. If the user said "today", use today's ISO date only — do not silently include yesterday or tomorrow.
- Output candidate set only (threads/transcripts/files ids or references).
- Prefer one `ask_work_iq` prompt per source family to keep results attributable.

### Entity Resolution (between Pass 1 and Vault Correlation)
After Pass 1 returns candidate results, resolve the people and entities mentioned into customer/account associations. This is the critical step that connects M365 activity back to specific customers.

**Step 1 — Extract names from Pass 1 results.**
Identify all people mentioned in candidate threads, meetings, transcripts, and emails (attendees, senders, @mentions, participants).

**Step 2 — Resolve via vault People notes.**
If `mcp-obsidian` is available:
1. Query `search_notes` with tag `people` (or search `People/` directory).
2. For each person found, read frontmatter fields: `customers` (list of associated customer accounts), `company`, `org` (`internal`/`customer`/`partner`).
3. Build a lookup table: `Person Name → [Customer1, Customer2, ...]`.
4. People with `org: customer` directly indicate customer attribution — their `company` field names the customer.
5. People with `org: internal` who have `customers` associations indicate which accounts that internal team member covers.

**Step 3 — Resolve via CRM.**
For people not found in vault, or to validate/enrich vault associations:
1. Query `crm_query` against `systemusers` by `fullname` or `internalemailaddress` to get their `systemuserid`.
2. Query `opportunities` filtered by `_ownerid_value` to find which opportunities/accounts they're aligned to.
3. Query `msp_engagementmilestones` filtered by `_ownerid_value` for milestone-level alignment.
4. Resolve the parent account from the opportunity's `_parentaccountid_value`.

**Step 4 — Attribute WorkIQ content to customers.**
Using the people→customer lookup:
1. Tag each Pass 1 candidate with the customer(s) it likely relates to, based on participant overlap.
2. If a meeting/thread has participants mapped to multiple customers, flag it as multi-customer and note which customers.
3. If participants cannot be resolved to any customer (unknown external contacts), mark the content as "unattributed" and note the unresolved names for the user.

**Step 5 — Confirm ambiguous attributions.**
If a candidate maps to multiple customers with equal confidence, or if key participants are unresolved, surface this to the user before proceeding to Pass 2:
- "This meeting included [Person A] (Contoso) and [Person B] (unresolved). Should I attribute it to Contoso, or do you know who Person B is associated with?"

**Fallback (no vault):** Skip Step 2; rely on CRM resolution (Step 3) and user confirmation for unknown contacts.

### Vault Correlation (between passes)
- **VAULT-CORRELATE** — after Pass 1 candidates are identified and entity resolution is complete, cross-reference with vault notes for the same date window if `mcp-obsidian` is available (see `obsidian-vault.instructions.md` § Vault Protocol Phases). Use the resolved customer attributions from Entity Resolution to target vault searches — read `Customers/<ResolvedCustomer>.md` for relevant context, prior decisions, and open items. Surface related meeting notes, decisions, and action items to enrich Pass 2 retrieval. If vault is unavailable, skip and proceed to Pass 2.

### Pass 2: Deep Retrieval
- Retrieve full detail only for candidates matched in Pass 1.
- Exclude unmatched sources to reduce noise and token load.
- Use targeted `ask_work_iq` prompts that explicitly cite selected candidates and exclusions.
- **Group by customer**: organize retrieval and output by resolved customer attribution from Entity Resolution. This ensures results are presented in account context, not as a flat undifferentiated list.
- For multi-customer candidates, retrieve once but present findings under each relevant customer.

## Narrowing Heuristics
- If too many results: tighten time window and entities first, then keywords.
- If too few results: broaden source types first, then expand time window.
- Keep query intent stable; change one boundary at a time.

## Output Format
Produce:
1. Fact map (explicit values + assumptions, including people→customer map)
2. Entity resolution summary (who was identified, which customers they map to, any unresolved contacts)
3. Pass 1 findings (candidate count + why selected)
4. Pass 2 scope (what will be fetched, what is excluded)
5. Final deliverable in requested output shape, **organized by customer** when multiple customers are involved

## Safety Notes
- Do not include content outside confirmed customer/entity boundaries.
- State assumptions explicitly whenever defaults are applied.
- Prefer concise summaries with links/references over raw transcript dumps unless explicitly requested.

## Suggested Prompt Skeleton for `ask_work_iq`
- Goal: what decision/output is needed.
- Scope: customer/account/opportunity + named people/entities (include resolved customer associations from entity resolution).
- Time window: explicit dates.
- Sources: Teams / meetings / Outlook / SharePoint (pick only needed).
- Output: requested shape (summary, actions, risks, decisions) with concise evidence citations, attributed to resolved customer(s).
