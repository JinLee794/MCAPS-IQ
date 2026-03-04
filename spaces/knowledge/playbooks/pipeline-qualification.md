---
tags: [playbook]
date: 2026-03-01
role: specialist
stage: "1"
trigger: "New inbound signal or customer request that could become a qualified opportunity"
---

# Pipeline Qualification

## When to Use

A new customer signal arrives — inbound request, partner referral, expansion signal from CSA/CSAM — and needs to be evaluated for commercial fit before creating a CRM opportunity.

## Steps

1. **Identify the signal source** — Email, meeting, partner referral, usage telemetry?
2. **Check customer file** — Does `knowledge/customers/{Name}.md` exist? If not, create one.
3. **BANT check** — Budget, Authority, Need, Timeline. Document each in the customer file.
4. **Solution play alignment** — Which solution play fits? Reference MCEM Stage 1 criteria.
5. **Create opportunity in CRM** — Only after BANT passes minimum threshold.
6. **Log in knowledge layer** — Update customer file with opportunity reference and meeting link.

## Expected Outcome

- Customer file updated with opportunity context
- CRM opportunity created with correct solution play
- Meeting note captured with qualification rationale

## Common Pitfalls

- Creating CRM opportunities for unqualified signals (clutters pipeline)
- Skipping the customer file (loses context for team members)
- Not documenting the "why" behind qualification decisions
