---
name: cloud-solution-architect-msx-ops
description: 'Cloud Solution Architect operating skill for MSX/MCEM. Drives committed milestone execution monitoring, Stage 4-5 value realization, architecture-to-execution handoff, and delivery ownership disambiguation. Use when user identifies as CSA or Cloud Solution Architect, or asks about execution readiness, committed milestone health, value realization packs, architecture handoff notes, or CSA-vs-CSAM authority boundaries.'
argument-hint: 'Provide opportunity/milestone IDs, commitment state, execution state, delivery dependencies, and the outcome needed'
---

# Agent Skill Profile

> **Purpose**: This SKILL.md defines role-specific responsibilities and communication patterns for managing **Microsoft Sales Experience (MSX)** in alignment with the **Microsoft Customer Engagement Methodology (MCEM)**.
>
> **Audience**: Field roles and copilots/agents supporting those roles.
>
> **Scope**: Opportunity & milestone management, pipeline hygiene, role-to-role handoffs, and cross-role orchestration.

---

# Cloud Solution Architect (CSA) MSX/MCEM Operations

## Shared Definitions
- **Opportunity**: customer engagement container aligned to MCEM stages.
- **Milestone**: execution unit for commitment, delivery, and usage/consumption outcomes.
- **Uncommitted**: still shaping; not fully resourced for delivery.
- **Committed**: customer agreement + internal readiness for execution.

### Mission (in MCEM/MSX) “reset” ### Mission (in MCEM/MSX)
Own the **customer technical success path** and ensure committed opportunities are executable, measurable, and progressing to outcomes—using MSX as the system of record.

### Primary accountabilities by MCEM stage
- **Stages 1–3 (Listen & Consult → Empower & Achieve)**
  - Contribute architecture direction, feasibility assessment, and technical risk management.
  - Align delivery approach with customer priorities and success plan.
- **Stage 4 (Realize Value)**
  - Drive execution readiness and value realization plans.
  - Partner with CSAM on success plan execution signals.
- **Stage 5 (Manage & Optimize)**
  - Maintain solution health, optimize usage/adoption, and identify expansion pathways.

### MSX ownership & hygiene expectations
**You are accountable for execution integrity in MSX once an opportunity/milestone is committed and within your scope.**

**Own / Update in MSX**
- Ensure the committed milestones you own have:
  - correct owners, realistic dates, accurate risk status
  - the right delivery motion captured (who delivers, how, and dependencies)
- Update fields used for planning/forecast and technical execution (e.g., region/capacity indicators when applicable).

**Hygiene cadence**
- Weekly: review committed milestones, especially those due in next 30–60 days.
- Monthly: confirm stage alignment and that execution evidence exists.

### Cross-role communication (how CSA works with others)
#### With Solution Engineer (SE)
- **Receive**: technical proof outcomes, architecture choices, and risk notes.
- **Provide**: execution plan validation, delivery dependencies, and what’s required for stage transition.

#### With Specialist (STU Specialist)
- **Align**: scope and outcomes, programs/investments, and any architecture guardrails.
- **Communicate**: what “ready for commit” looks like from a delivery perspective.

#### With CSAM
- **Partner**: customer success plan, usage/adoption milestones, and health signals.
- **Handoff**: when delivery is underway, ensure CSAM has measurable success metrics and cadence.

### Handoff checklist (Specialist/SE → CSA)
- Proof results and architectural decision points captured.
- Customer success measures defined (baseline + target).
- Delivery dependencies identified (people, partner, capacity, environment, security).

### Escalation triggers
- Committed milestone is at-risk/blocked with no recovery plan.
- Customer success measures are missing or unmeasurable.
- Significant scope drift that affects outcomes or timeline.

### CSA Boundary Rules & Friction Scenarios

#### CSA is / CSA is not
**CSA is responsible for**
- Execution readiness and technical integrity.
- Architecture feasibility, dependency sequencing, and technical risk posture.
- Technical truth in MSX (risk state, dependencies, and execution blockers).

**CSA is not responsible for**
- Day-to-day delivery PM functions.
- Partner staffing, dispatch operations, or partner-side tooling hygiene.
- Commercial ownership or new-opportunity pipeline ownership.

#### Stage-based escalation rules
- **Stages 1–3 (Shaping / pre-commit)**
  - Require CSA execution-readiness confirmation before commitment.
  - If delivery motion, environment prerequisites, or success metrics are missing, mark as not ready to commit.
- **Stage 4 (Realize Value / execution)**
  - CSA engages for technical decisions, architecture constraints, and technical blockers.
  - CSAM leads delivery execution escalations (resourcing, schedule, customer expectation resets).
- **Stage 5 (Manage & Optimize)**
  - CSA identifies optimization and expansion signals.
  - Specialist/ATU owns conversion of expansion signals into net-new opportunity motions.

#### Common friction scenarios and guardrails

**1) “CSA as delivery owner” vs “CSA as execution architect” confusion**
- **Common symptom**: CSA is assigned as milestone owner while delivery motion is Partner/ISD/Unified.
- **Guardrail**: Preserve CSA accountability on readiness/integrity, and route delivery ownership to delivery roles.
- **Agent guardrail**: Auto-flag owner-motion mismatches for reassignment or role clarification.

**2) Stage 3 → Stage 4 handoff gaps (STU → CSU)**
- **Common symptom**: Opportunity is committed before execution metadata is complete.
- **Guardrail**: Commitment requires CSA readiness sign-off and complete execution prerequisites.
- **Required checks**: delivery motion, environment prerequisites, success metrics (baseline + target).

**3) Unified Services ambiguity (CSA vs CSAM vs ISD)**
- **Common symptom**: Unified dependencies appear only after commitment and block startup.
- **Guardrail**: CSA surfaces feasibility constraints early; CSAM owns expectation management and escalation.
- **Required action**: Document Unified blockers and date impact in milestone comments/risk narrative.

**4) Milestone ownership vs “truth maintenance” tension**
- **Common symptom**: CSA is not creator/owner but receives alerts and expected cleanup work.
- **Guardrail**: CSA updates technical truth fields; ownership/admin mismatches are escalated, not absorbed.
- **Required action**: Update technical risk/dependencies and route administrative ownership corrections.

**5) “CSA as escalation sink” during execution**
- **Common symptom**: Delivery or commercial issues are routed to CSA by default.
- **Guardrail**: CSA engages only when technical decisions are required.
- **Deflection language**:
  - “This is a delivery execution issue—CSAM to lead.”
  - “This requires partner resourcing escalation.”

**6) Expansion vs optimization confusion (Stage 5)**
- **Common symptom**: Optimization insights are either duplicated as pipeline or lost in execution tasks.
- **Guardrail**: CSA records expansion signals; Specialist/ATU owns opportunity creation.
- **Required action**: Capture signal + owner routing in MSX tasks/comments before opportunity creation.

---

## Agent Skills (declarative MCP flows)

### Runtime contract (current server behavior)
- **Read tools are live**: `crm_auth_status`, `crm_whoami`, `get_my_active_opportunities`, `list_accounts_by_tpid`, `list_opportunities`, `get_milestones`, `get_milestone_activities`, `crm_get_record`, `crm_query`, `get_task_status_options`.
- **Write-intent tools are dry-run**: `create_task`, `update_task`, `close_task`, `update_milestone` return preview payloads (`mock: true`).
- **Staged execution pattern is documented but not exposed as tools yet**: treat write outputs as approval-ready recommendations.

#### Upfront Scoping Pattern (minimize context expansion)
Collect relevant scope in as few calls as possible before branching into per-milestone workflows:
0. **VAULT-PREFETCH** — read vault customer roster and context to scope CRM queries. Skipped automatically if `mcp-obsidian` is unavailable (see `obsidian-vault.instructions.md` § Vault Protocol Phases).
1. `get_my_active_opportunities()` — one call returns all active opps with customer names (use `customerKeyword` to narrow).
2. `get_milestones({ opportunityId, statusFilter: 'active', format: 'summary' })` — compact grouped output instead of full records.
3. Only call `get_milestone_activities(milestoneId)` for specific milestones needing investigation.
4. Reserve `crm_query` for ad-hoc OData needs not covered by structured tools.

### WorkIQ MCP companion (M365 retrieval)
- Use WorkIQ MCP (`ask_work_iq`) for collaboration evidence that is not modeled in CRM entities.
- Primary M365 sources: Teams chats/channels, meetings/transcripts, Outlook email/calendar, SharePoint/OneDrive docs.
- Use this companion pattern:
  - CRM tools answer ownership/status/execution integrity.
  - WorkIQ answers discussion history, decision rationale, and document/meeting evidence.

### Skill: "Committed Milestone Execution Monitor"
**Trigger**: Daily/weekly execution sweep for committed scope.

**Flow**:
1. Call `crm_auth_status`.
2. Call `get_my_active_opportunities()` — single call replaces `list_accounts_by_tpid` + `list_opportunities`.
3. Call `get_milestones({ opportunityId, statusFilter: 'active', format: 'summary' })` per opportunity — returns compact grouped output; filter committed milestones from summary.
4. Call `get_milestone_activities(milestoneId)` only for at-risk/blocked candidates identified in step 3.
5. Generate dry-run corrective updates with `update_milestone(...)` and follow-up tasks via `create_task(...)`.

**Decision logic**:
- Classify execution state: on_track | at_risk | blocked based on date proximity, activity evidence, and missing ownership/comments.
- Escalate when no recovery activity exists for a near-term committed milestone.

**Output schema**:
- `risk_dashboard`: milestone-level status with reason codes
- `remediation_plan`: owner + action + due date
- `dry_run_operations`: update/task preview payloads

### Skill: "Stage 4–5 Value Realization Pack"
**Trigger**: Opportunity enters Realize Value / Manage & Optimize.

**Flow**:
1. Call `crm_get_record(entitySet='opportunities', id=opportunityId, select=...)`.
2. Call `get_milestones({ opportunityId, statusFilter: 'active', format: 'summary' })` — isolate value/adoption milestones from compact output.
3. Call `get_milestone_activities(milestoneId)` only for milestones lacking execution cadence evidence.
4. If outcomes are under-specified, call `update_milestone(...)` (dry-run) for measurable comments/use updates.
5. If orchestration actions are missing, call `create_task(...)` (dry-run) for CSAM/CSU actions.

**Decision logic**:
- Mark pack complete only when each value milestone has metric intent, owner, date, and next activity.
- If evidence is weak, output mandatory gap closures before declaring value realization readiness.

**Output schema**:
- `value_checklist`
- `measurement_plan`
- `csam_ready_summary`
- `dry_run_gap_fixes`

### Skill: "Architecture-to-Execution Handoff Note"
**Trigger**: Proof complete or commitment flips uncommitted → committed.

**Flow**:
1. Call `get_milestones({ opportunityId, statusFilter: 'active', format: 'summary' })` to identify impacted milestones.
2. Call `get_milestone_activities(milestoneId)` for proof traces (targeted milestones only).
3. Call `crm_query(entitySet='tasks', filter=..., select=...)` if broader dependency tracking is required.
4. Draft handoff with explicit asks; include dry-run `create_task(...)` payloads for missing owners/actions.

**Decision logic**:
- Handoff is not execution-ready if constraints, dependencies, or success metrics are implicit.

**Output schema**:
- `architecture_summary`
- `constraints`
- `deliverables`
- `risks`
- `success_metrics`
- `next_actions` (with dry-run task proposals)

### Skill: "Execution Readiness vs Delivery Ownership Disambiguator"
**Trigger**: CSA listed as milestone owner while delivery motion indicates Partner/ISD/Unified ownership.

**Flow**:
1. Call `get_milestones({ opportunityId, statusFilter: 'active', format: 'summary' })` — collect owner + delivery motion fields from compact output.
2. Call `crm_query(entitySet='tasks', filter=..., select=...)` for ownership/coordination tasks.
3. Identify owner-motion mismatches and impacted due dates.
4. Produce dry-run `update_milestone(...)` recommendations for ownership clarification comments/risk notes.
5. Produce dry-run `create_task(...)` recommendations to assign delivery-accountability actions.

**Decision logic**:
- If milestone owner is CSA and delivery motion is non-CSA delivery, classify as boundary_mismatch.
- If no explicit delivery accountable owner exists, classify as execution_risk.

**Output schema**:
- `boundary_mismatch_report`
- `role_clarification_actions`
- `dry_run_reassignments`

### Skill: "Stage 4 Readiness Gatekeeper"
**Trigger**: Opportunity is approaching commitment or transitioning into Stage 4.

**Flow**:
1. Call `crm_get_record(entitySet='opportunities', id=opportunityId, select=...)`.
2. Call `get_milestones({ opportunityId, statusFilter: 'active', format: 'summary' })` for commitment-bound milestones.
3. Call `get_milestone_activities(milestoneId)` for execution evidence (targeted milestones only).
4. Validate required readiness metadata: delivery motion, environment prerequisites, and success metrics.
5. Generate dry-run `update_milestone(...)` and `create_task(...)` gap-closure actions.

**Decision logic**:
- Block readiness if any non-negotiable metadata is missing.
- Mark ready_for_commit only when CSA confirmation and all required metadata are present.

**Output schema**:
- `readiness_gate_status`
- `missing_requirements`
- `dry_run_gate_closures`

### Skill: "Unified Readiness Early Warning"
**Trigger**: Milestones include Unified-dependent execution paths.

**Flow**:
1. Call `get_milestones({ opportunityId, keyword: 'unified', statusFilter: 'active', format: 'summary' })` — use keyword to isolate Unified-related milestones.
2. Call `get_milestone_activities(milestoneId)` to detect eligibility/accreditation/dispatch evidence (targeted milestones only).
3. If missing, draft dry-run `update_milestone(...)` risk/status updates.
4. Draft dry-run `create_task(...)` actions for CSAM and Specialist escalation/coordination.

**Decision logic**:
- If Unified dependency exists without eligibility evidence, classify as unified_blocker_risk.
- If customer timeline depends on Unified and no contingency exists, classify as schedule_impact_high.

**Output schema**:
- `unified_dependency_report`
- `timeline_impact_summary`
- `dry_run_early_warning_actions`

### Skill: "Technical Truth vs Admin Noise Filter"
**Trigger**: CSA receives milestone alerts with mixed technical and administrative actions.

**Flow**:
1. Call `get_milestones({ opportunityId, statusFilter: 'active', format: 'summary' })` for affected milestones.
2. Call `get_milestone_activities(milestoneId)` for supporting evidence (targeted milestones only).
3. Classify each alert/action as technical_truth_required or admin_reroute.
4. Draft dry-run `update_milestone(...)` only for technical-truth changes.
5. Draft dry-run `create_task(...)` rerouting actions for ownership/admin corrections.

**Decision logic**:
- Technical risk/dependency/feasibility updates are CSA-actionable.
- Pure ownership/admin completeness without technical change is rerouted.

**Output schema**:
- `alert_classification`
- `csa_action_set`

### Skill: "M365 Execution Evidence Correlator"
**Trigger**: CSA needs proof of execution context beyond CRM comments/activities.

**Flow**:
1. Build scoped query (customer/opportunity, people, **explicit date range**, source types).
2. Call WorkIQ MCP (`ask_work_iq`) to retrieve relevant Teams/meeting/Outlook/SharePoint evidence.
3. **VAULT-CORRELATE** — cross-reference WorkIQ results with vault notes for the same date window. Surface prior meeting notes, architecture decisions, and dependency context. Strict date boundaries.
4. Call `get_milestones({ opportunityId, statusFilter: 'active', format: 'summary' })` and `get_milestone_activities(milestoneId)` (targeted only).
5. Compare M365 evidence + vault context with CRM status and draft dry-run gap closures via `update_milestone(...)` and `create_task(...)`.

**Output schema**:
- `m365_evidence_map`
- `vault_correlation` (matched vault notes and connections, if vault available)
- `execution_integrity_findings`
- `dry_run_corrections`
- `reroute_action_set`

### Skill: "Escalation Classification Assistant"
**Trigger**: Execution issue is escalated to CSA and routing is unclear.

**Flow**:
1. Call `get_milestones({ opportunityId, statusFilter: 'active', format: 'summary' })` and `get_milestone_activities(milestoneId)` for context (targeted milestones only).
2. Optionally call `crm_query(entitySet='tasks', filter=..., select=...)` for open actions.
3. Classify issue as technical | delivery | commercial.
4. Draft dry-run task routing with `create_task(...)` to correct owner role.

**Decision logic**:
- Technical architecture constraints → CSA-owned path.
- Delivery execution/resourcing/schedule → CSAM or delivery owner path.
- Commercial/scope negotiation → Specialist/sales path.

**Output schema**:
- `issue_type`
- `recommended_owner`
- `dry_run_routing_tasks`

### Skill: "Expansion Signal Router"
**Trigger**: Stage 5 optimization insights may imply expansion opportunities.

**Flow**:
1. Call `get_milestones({ opportunityId, statusFilter: 'active', format: 'summary' })` — isolate optimize/adoption outcomes from compact output.
2. Call `get_milestone_activities(milestoneId)` for evidence of unmet potential or extension patterns (targeted milestones only).
3. Draft dry-run `create_task(...)` to route expansion signal to Specialist/ATU owner.
4. Draft dry-run `update_milestone(...)` comments to preserve signal context in MSX.

**Decision logic**:
- If optimization insight changes business scope but lacks owner routing, classify as expansion_signal_unrouted.
- Do not treat signal capture as automatic net-new opportunity creation.

**Output schema**:
- `expansion_signal_log`
- `owner_routing_plan`
- `dry_run_signal_tasks`

---

## Suggested source references
- MSX documentation (internal): https://review.learn.microsoft.com/seller
- MCEM portal (internal): https://aka.ms/MCEM
