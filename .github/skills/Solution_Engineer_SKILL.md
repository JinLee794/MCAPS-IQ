---
name: solution-engineer-msx-ops
description: 'Solution Engineer operating skill for MSX/MCEM. Drives daily milestone task hygiene, BANT-qualified uncommitted handoff to CSU, and influenced committed-milestone follow-through. Use when user identifies as Solution Engineer or SE, or asks about milestone task updates, BANT readiness, uncommitted handoff preparation, SE-influenced milestone continuity, or technical proof task management.'
argument-hint: 'Provide opportunity/milestone IDs, commitment state, BANT status, and the outcome needed'
---

# Solution Engineer MSX/MCEM Operations

## Purpose
This skill defines the Solution Engineer (SE) day-to-day operating model in MSX/MCEM with one primary behavior:
- Keep milestone `tasks` current and actionable.

It standardizes when SE should:
- add/update milestone tasks,
- hand off uncommitted milestones to CSU roles after BANT is established,
- continue task updates on committed milestones where SE influenced outcome.

## When to Use
- Daily/weekly milestone hygiene for active opportunities.
- Uncommitted milestone is becoming ready for CSU execution and BANT is available.
- Committed milestone was SE-influenced and tasks need to be created/updated to keep execution unblocked.
- Stage 2/3/4 transitions need explicit task ownership and handoff clarity.

## Runtime Contract
- Read tools are live: `crm_auth_status`, `crm_whoami`, `get_my_active_opportunities`, `list_accounts_by_tpid`, `list_opportunities`, `get_milestones`, `get_milestone_activities`, `crm_get_record`, `crm_query`, `get_task_status_options`.
- Write-intent tools are dry-run: `create_task`, `update_task`, `close_task`, `update_milestone` return `mock: true` previews.
- No execute/cancel staging endpoints: treat write-tool output as recommended updates.
- Follow `.github/instructions/msx-role-and-write-gate.instructions.md` for mandatory human confirmation before write-intent operations.

### Upfront Scoping Pattern (minimize context expansion)
Collect relevant scope in as few calls as possible before branching into per-milestone workflows:
1. `get_my_active_opportunities()` — one call returns all active opps with customer names (use `customerKeyword` to narrow further).
2. `get_milestones({ opportunityId, statusFilter: 'active', format: 'summary' })` — returns compact grouped output instead of full records.
3. Only call `get_milestone_activities(milestoneId)` for specific milestones that need investigation (stale, at-risk, or blocked).
4. Reserve `crm_query` as an escape hatch for ad-hoc OData needs not covered by structured tools.

## WorkIQ MCP for M365 Evidence
- Use WorkIQ MCP (`ask_work_iq`) when required context is in Microsoft 365 sources rather than CRM tables.
- Typical sources: Teams chat/channel threads, meeting transcripts/notes, Outlook email/calendar, SharePoint/OneDrive docs.
- Use CRM + WorkIQ together:
   - CRM tools provide system-of-record status and identifiers.
   - WorkIQ provides evidence used to explain blockers, decisions, and ownership signals.

## Shared Definitions
- Opportunity: customer engagement container aligned to MCEM stage outcomes.
- Milestone: execution unit for commitment, delivery, and usage/consumption outcomes.
- Uncommitted: still shaping and not fully resourced for delivery.
- Committed: customer agreement plus internal readiness for execution.
- Influenced (SE): SE materially shaped technical direction, proof outcome, objections, or commitment confidence.
- BANT-ready: Budget, Authority, Need, Timeline are sufficiently evidenced for transition planning.

## Core Operating Loop (SE Daily)
1. Get active opportunities and milestones in scope.
2. For each milestone, verify task hygiene:
   - owner,
   - due date,
   - status,
   - blocker text,
   - completion condition.
3. Add missing tasks and update stale tasks.
4. Branch by commitment state:
   - uncommitted: validate BANT and decide if CSU handoff is appropriate,
   - committed: if SE influenced, continue updating/creating tasks until clear owner-driven execution is stable.
5. Return concise action set with owner + due date for each task.

## Role Mission and Accountability
### Mission
Drive technical win quality through disciplined milestone-task management and timely cross-role handoff.

### Stage Accountability
- Stages 1–2: shape technical need and proof plan; keep uncommitted milestone tasks current.
- Stage 3: drive proof execution and task clarity; remove blockers quickly.
- Stages 4–5: preserve continuity through CSU handoff and post-commitment task hygiene on SE-influenced milestones.

### MSX Hygiene Expectations
- Add SE to deal team when materially contributing.
- Maintain task-level accuracy on milestones SE touches.
- Avoid milestone-level ambiguity by expressing execution via concrete tasks.

## Inputs Required
- Opportunity stage, owner roles, and milestone category.
- Milestone commitment state (`uncommitted` or `committed`).
- Current milestone tasks and statuses.
- SE influence signal (`yes/no` + brief reason).
- BANT evidence state for uncommitted milestones.
- Delivery path and attribution fields (partner, ISD, CSA, customer).

## Primary Decision Policy
### A) Uncommitted Milestones
- SE owns task hygiene and technical shaping tasks.
- If BANT is not ready:
  - keep milestone uncommitted,
  - update/create tasks to close BANT gaps.
- If BANT is ready and transition is appropriate:
  - prepare handoff to CSU roles (`Cloud Solution Architect`, `CSAM`),
  - include explicit role asks and next tasks.

### B) Committed Milestones
- If SE influenced commitment/outcome:
  - continue updating/creating tasks to protect delivery continuity,
  - ensure blockers, owners, due dates, and acceptance signals remain current.
- If SE did not influence and no active technical dependency exists:
  - avoid unnecessary task churn,
  - provide monitoring note only.

## Operating Procedure
1. Resolve role and scope (`crm_auth_status` + selected role workflow).
2. **Run VAULT-PREFETCH** (see `obsidian-vault.instructions.md`) — scope CRM queries using vault customer roster and context. Skipped automatically if `mcp-obsidian` is unavailable.
3. Discover active opportunities: `get_my_active_opportunities()` (or `get_my_active_opportunities({ customerKeyword })` to narrow).
3. Pull scoped milestone summaries: `get_milestones({ opportunityId, statusFilter: 'active', format: 'summary' })` per opportunity.
4. Pull activities only for milestones with unclear progression (`get_milestone_activities(milestoneId)`).
5. Perform task hygiene checks for flagged milestones.
6. Apply commitment branch policy:
   - uncommitted + BANT-ready => CSU handoff preparation,
   - committed + SE-influenced => task updates continue.
7. Build dry-run write plan (`create_task`, `update_task`, `close_task`, optional `update_milestone`).
8. Produce confirmation packet before any write-intent execution.
9. **Run VAULT-PROMOTE** — persist validated findings to the vault after workflow completion.

## Guardrails (Pass/Fail)
### 1) Task Completeness
- PASS: every active milestone has next-step tasks with owner, due date, and status.
- FAIL action: create/update missing or stale tasks.

### 2) Uncommitted BANT Gate
- PASS: BANT evidence exists and milestone is suitable for CSU execution handoff.
- FAIL action: keep uncommitted and add tasks specifically targeting missing B/A/N/T items.

### 3) CSU Handoff Quality
- PASS: handoff includes customer outcome, technical decisions, blockers, role asks (`CSA`, `CSAM`), and immediate tasks.
- FAIL action: do not mark handoff-ready; update tasks to complete missing artifacts.

### 4) Committed Influenced Follow-through
- PASS: for committed milestones influenced by SE, tasks remain current until execution ownership is stable.
- FAIL action: refresh tasks and owners; log explicit next actions.

## Handoff Rules (Uncommitted → CSU)
Use handoff when all are true:
- milestone remains operationally uncommitted,
- BANT is sufficiently evidenced,
- execution needs CSU ownership alignment.

Handoff packet must include:
- customer/account and opportunity identifiers,
- current milestone and task state,
- BANT summary,
- requested actions for `CSA` and `CSAM`,
- first 1–3 tasks with owners and due dates.

## Cross-role Communication and Handoff
### CSA
- Engage for feasibility/execution readiness and architecture constraints.
- Receive BANT-qualified uncommitted handoff package when CSU execution planning is needed.

### Specialist (STU)
- Align during stages 1–3 on solution play, proof scope, and required resources.

### CSAM
- Engage for customer success execution planning when BANT-qualified handoff is made.
- On committed, SE-influenced milestones, coordinate task ownership transitions and continuity.

### Escalation Triggers
- Technical proof blocked more than 7 days without unblock path.
- Milestone dates materially diverge from delivery reality.
- Capacity/region constraints require specialized routing.

## Declarative MCP Flows
### Flow A: Daily/Weekly Milestone Task Hygiene
Trigger: weekly cadence or pre-review hygiene pass.

Steps:
1. `crm_auth_status`
2. **VAULT-PREFETCH** — read vault customer roster and context to scope the hygiene pass. If vault is unavailable, proceed with CRM-only scoping.
3. `get_my_active_opportunities()` — replaces `list_accounts_by_tpid` + `list_opportunities`; returns compact list in one call.
3. `get_milestones({ opportunityId, statusFilter: 'active', format: 'summary' })` — compact grouped output per opportunity; skip completed/closed milestones.
4. `get_milestone_activities(milestoneId)` — only for milestones flagged as stale, at-risk, or missing tasks.
5. `crm_query(...)` only when extra technical fields are required.

Decision logic:
- Flag stale/missing tasks first.
- Prioritize by near-term due date, blocker severity, and commitment impact.

Output schema:
- `task_hygiene_findings`
- `suggested_updates`
- `cross_role_note`

### Flow B: Uncommitted BANT-to-CSU Handoff
Trigger: uncommitted milestone with potential readiness for CSU execution.

Steps:
1. `get_milestones({ opportunityId, statusFilter: 'active', format: 'summary' })` — compact view; isolate uncommitted milestones from summary.
2. `get_milestone_activities(milestoneId)` for BANT and readiness evidence (only for target milestones).
3. `crm_get_record(entitySet='opportunities', id=opportunityId, select=...)` when additional opportunity fields are needed.
4. Propose dry-run remediation actions:
   - `update_milestone(...)`
   - `create_task(...)`
   - `update_task(...)`

Decision logic:
- If BANT-ready and appropriate, issue CSU handoff packet with `CSA` + `CSAM` asks.
- If not BANT-ready, keep uncommitted and create/update BANT-closing tasks.

Output schema:
- `bant_status` (`ready` | `not_ready`)
- `evidence_summary`
- `dry_run_updates`
- `csu_handoff_packet`

### Flow C: Committed Influenced Milestone Follow-through
Trigger: committed milestone where SE influence is `yes`.

Steps:
1. `get_milestones({ opportunityId, statusFilter: 'active', format: 'summary' })` — isolate committed milestones influenced by SE from compact output.
2. `get_milestone_activities(milestoneId)` for progression and blocker evidence (targeted, not all milestones).
3. Dry-run updates:
   - `update_task(...)`
   - `create_task(...)`
   - `close_task(...)` when completion criteria are met

Decision logic:
- Keep task updates active until owner-driven execution is stable and clear.
- If dependency is no longer active, provide minimal monitoring note.

Output schema:
- `influenced_committed_status`
- `task_update_plan`
- `blockers`
- `role_asks`
- `proposed_tasks` (dry-run)

### Flow D: M365 Evidence Companion (WorkIQ)
Trigger: CRM status is unclear and corroboration is needed from collaboration artifacts.

Steps:
1. Build scope (customer, opportunity, people, **explicit date range — always bound to today or a stated window**).
2. Call WorkIQ MCP (`ask_work_iq`) for Teams/meetings/Outlook/SharePoint evidence.
3. **VAULT-CORRELATE** — cross-reference WorkIQ results with vault notes for the same date window. Surface prior meeting notes, decisions, and action items that relate to retrieved evidence. Maintain strict date boundaries.
4. Compare evidence with `get_milestones({ opportunityId, statusFilter: 'active', format: 'summary' })` and `get_milestone_activities(milestoneId)` (targeted only).
5. Produce a concise `evidence_vs_crm` summary and dry-run remediation proposals if gaps exist.

Output schema:
- `fact_map`
- `m365_evidence_summary`
- `vault_correlation` (matched vault notes and connections, if vault available)
- `crm_alignment_findings`
- `suggested_updates` (dry-run)

### Flow E: Vault-Correlated Activity Mapping
Trigger: User asks "what should I update based on today's activities" or similar activity-to-milestone mapping request.

Steps:
1. `crm_auth_status`
2. **VAULT-PREFETCH** — read vault customer roster to identify which customers to query M365 for.
3. `get_my_active_opportunities()` — get active opps, filtered by vault roster when available.
4. Call WorkIQ MCP (`ask_work_iq`) scoped to **today only** (explicit date boundaries) for each vault-listed customer with active opps.
5. **VAULT-CORRELATE** — search vault for today's meeting notes, prior decisions, and action items matching retrieved activities. Strict same-day boundary.
6. `get_milestones({ opportunityId, statusFilter: 'active', format: 'summary' })` for opps with matched activities.
7. Map activities → milestones: identify which milestones should be updated or created based on today's evidence + vault context.
8. Produce dry-run recommendations (create milestone, update forecast comments, create/update tasks).
9. **VAULT-PROMOTE** — persist validated activity-to-milestone mappings to vault customer files.

Output schema:
- `activity_map` (today's activities grouped by customer)
- `vault_context` (related vault notes surfaced by VAULT-CORRELATE)
- `milestone_recommendations` (create/update actions with rationale)
- `dry_run_operations` (preview payloads)

## Decision Branches
- If milestone is uncommitted and BANT is incomplete: do not hand off; update BANT-closing tasks.
- If milestone is uncommitted and BANT is complete: create CSU handoff packet (`CSA`, `CSAM`) and transition tasks.
- If milestone is committed and SE influenced: continue task updates until stable execution ownership is explicit.
- If milestone is committed and SE did not influence: limit to hygiene-only interventions.

## Completion Criteria
- Every active milestone has current, owner-assigned tasks.
- Uncommitted milestones are either BANT-closing or BANT-qualified and handed off to CSU roles.
- Committed SE-influenced milestones have updated tasks reflecting real execution state.
- MSX-ready note captures owner, due date, and next action per task.

## Output Format
Produce:
1. Milestone classification (`uncommitted`/`committed`, `influenced` yes/no)
2. Guardrail pass/fail
3. Task actions (`create`/`update`/`close`)
4. Handoff decision (if uncommitted: BANT + CSU handoff yes/no)
5. Immediate owner plus due date
6. MSX-ready update text (concise)

## Suggested References
- MSX onboarding and documentation: https://review.learn.microsoft.com/seller
- MCEM portal: https://aka.ms/MCEM
