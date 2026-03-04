---
tags: [playbook]
date: 2026-03-01
role: csa
stage: "3"
trigger: "POC concludes and delivery begins — architecture decisions need to be documented"
---

# Architecture Handoff

## When to Use

A proof-of-concept has concluded (Stage 2 → 3) and the CSA needs to document architecture decisions, constraints, and guardrails for the delivery phase.

## Steps

1. **Collect proof artifacts** — Pull results, configurations, and findings from the SE's proof work.
2. **Document architecture decisions** — What was decided, what alternatives were considered, why this path.
3. **Define guardrails** — Non-negotiable constraints (security, compliance, performance thresholds).
4. **Map dependencies** — What must be in place before delivery can start?
5. **Set success KPIs** — Measurable indicators that the architecture is working in production.
6. **Create handoff note** — Structured document in `knowledge/meetings/` linking to customer file.
7. **Update customer file** — Add architecture context and link to handoff note.

## Expected Outcome

- Architecture Decision Record in the knowledge layer
- Customer file updated with delivery-phase context
- Guardrails documented for execution monitoring

## Common Pitfalls

- Decisions made verbally but never written down
- Guardrails not explicit — discovered mid-delivery when violated
- Dependency sequencing not validated before committing timeline
