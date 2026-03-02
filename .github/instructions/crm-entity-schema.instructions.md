---
description: "CRM entity schema reference for Dynamics 365 OData queries. Use when constructing crm_query, crm_get_record, or any OData filter/select expressions to avoid property name guessing."
applyTo: "mcp-server/**"
---
# CRM Entity Schema Reference

Use this reference when constructing `crm_query` calls against Dynamics 365 entities.
Incorrect entity set names or field names will return 404 or 400 errors.

## Rules
- **Never guess property names.** Use only the property names listed below or discovered via `crm_list_entity_properties`.
- If a needed property is not listed here, call `crm_list_entity_properties` with the entity logical name before querying.
- Lookup/reference fields always use the pattern `_<fieldname>_value` (e.g. `_ownerid_value`, `_parentaccountid_value`).
- Entity set names are **plural** (e.g. `accounts`, `opportunities`). Entity logical names for metadata are **singular** (e.g. `account`, `opportunity`).

## Common Entities

### accounts (logical name: account)
| Property | Type | Description |
|---|---|---|
| accountid | Uniqueidentifier | Primary key |
| name | String | Account name |
| msp_mstopparentid | String | MS Top Parent ID (TPID) — **NOT** `msp_accounttpid` |
| _ownerid_value | Lookup | Owner system user |
| _parentaccountid_value | Lookup | Parent account |

### opportunities (logical name: opportunity)
| Property | Type | Description |
|---|---|---|
| opportunityid | Uniqueidentifier | Primary key |
| name | String | Opportunity name |
| estimatedclosedate | DateTime | Estimated close date |
| msp_estcompletiondate | DateTime | Estimated completion date |
| msp_consumptionconsumedrecurring | Decimal | Consumed recurring consumption |
| _ownerid_value | Lookup | Owner system user |
| _parentaccountid_value | Lookup | Parent account |
| msp_salesplay | Picklist | Sales play / solution area |
| statecode | State | Record state (0 = Open) |

### msp_engagementmilestones (logical name: msp_engagementmilestone)
| Property | Type | Description |
|---|---|---|
| msp_engagementmilestoneid | Uniqueidentifier | Primary key |
| msp_milestonenumber | String | Milestone number (e.g. "7-123456789") |
| msp_name | String | Milestone name |
| _msp_workloadlkid_value | Lookup | Workload |
| msp_commitmentrecommendation | Picklist | Commitment recommendation |
| msp_milestonecategory | Picklist | Milestone category |
| msp_monthlyuse | Decimal | Monthly use value |
| msp_milestonedate | DateTime | Milestone date |
| msp_milestonestatus | Picklist | Milestone status |
| _ownerid_value | Lookup | Owner system user |
| _msp_opportunityid_value | Lookup | Parent opportunity |
| msp_forecastcomments | String | Forecast comments |
| msp_forecastcommentsjsonfield | String | Forecast comments (JSON) |

### tasks (logical name: task)
| Property | Type | Description |
|---|---|---|
| activityid | Uniqueidentifier | Primary key |
| subject | String | Task subject/title |
| description | String | Task description |
| scheduledend | DateTime | Due date |
| statuscode | Status | Status code (5=Completed, 6=Cancelled) |
| statecode | State | Record state |
| _ownerid_value | Lookup | Owner system user |
| _regardingobjectid_value | Lookup | Regarding record |
| msp_taskcategory | Picklist | Task category |
| createdon | DateTime | Created timestamp |

### systemusers (logical name: systemuser)
| Property | Type | Description |
|---|---|---|
| systemuserid | Uniqueidentifier | Primary key |
| fullname | String | Full name |
| internalemailaddress | String | Email address |
| title | String | Job title |
| businessunitid | Lookup | Business unit |

## Known Invalid Entity Sets (DO NOT USE)

| Attempted | Error | Correct |
|-----------|-------|---------|
| `msp_milestones` | 404 | `msp_engagementmilestones` |
| `msp_milestoneses` | 404 | `msp_engagementmilestones` |

## Known Invalid Fields (DO NOT USE)

| Field | Error | Notes |
|-------|-------|-------|
| `msp_forecastedconsumptionrecurring` | 400 — not a valid property | Does not exist on `msp_engagementmilestone` |
| `msp_committedconsumptionrecurring` | 400 — not a valid property | Does not exist on `msp_engagementmilestone` |
| `msp_estimatedcompletiondate` | 400 — not a valid property | Does not exist on `msp_engagementmilestone`; use `msp_milestonedate` instead |

## Common Mistakes to Avoid
- ❌ `msp_accounttpid` → ✅ `msp_mstopparentid` (TPID on accounts)
- ❌ `ownerid` in $filter → ✅ `_ownerid_value` (lookup pattern)
- ❌ `parentaccountid` in $filter → ✅ `_parentaccountid_value`
- ❌ `opportunityid` in milestone filter → ✅ `_msp_opportunityid_value`
- ❌ `taskid` → ✅ `activityid` (tasks use activity primary key)
- ❌ `msp_engagementmilestone` as entity set → ✅ `msp_engagementmilestones` (plural)
- ❌ `msp_estimatedcompletiondate` on milestone → ✅ `msp_milestonedate` (correct date field)

## Milestone Status Codes

| Label | Value |
|-------|-------|
| On Track | `861980000` |
| At Risk | `861980001` |
| Blocked | `861980002` |
| Completed | `861980003` |
| Cancelled | `861980004` |
| Not Started | `861980005` |
| Closed as Incomplete | `861980007` |

## Commitment Recommendation Codes

| Label | Value |
|-------|-------|
| Uncommitted | `861980000` |
| Committed | `861980001` |

## Milestone Category Codes

| Label | Value |
|-------|-------|
| POC/Pilot | `861980000` |

## Filtering Milestones via `crm_query`

Prefer `crm_query` with `entitySet: "msp_engagementmilestones"` over `get_milestones` when you need:
- Status filtering (e.g., only active milestones)
- Multi-opportunity queries (OR filters)
- Date range scoping
- Minimal field selection

### Example: Milestones for one opportunity (active only)

```
crm_query({
  entitySet: "msp_engagementmilestones",
  filter: "_msp_opportunityid_value eq '<GUID>' and msp_milestonestatus eq 861980000",
  select: "msp_milestonenumber,msp_name,msp_milestonestatus,msp_milestonedate,msp_monthlyuse,msp_commitmentrecommendation",
  orderby: "msp_milestonedate asc",
  top: 25
})
```

### Example: Milestones across multiple opportunities

```
crm_query({
  entitySet: "msp_engagementmilestones",
  filter: "(_msp_opportunityid_value eq '<GUID1>' or _msp_opportunityid_value eq '<GUID2>') and msp_milestonestatus ne 861980003 and msp_milestonestatus ne 861980004",
  select: "msp_milestonenumber,msp_name,msp_milestonestatus,msp_milestonedate,msp_monthlyuse,_msp_opportunityid_value",
  orderby: "msp_milestonedate asc",
  top: 50
})
```

## `get_milestones` Tool — Actual Parameters

The `get_milestones` tool only accepts these parameters (defined in `mcp-server/src/tools.js`):

| Parameter | Type | Description |
|-----------|------|-------------|
| `opportunityId` | string (GUID) | Filter by single opportunity |
| `milestoneNumber` | string | Filter by milestone number |
| `milestoneId` | string (GUID) | Get single milestone by ID |
| `ownerId` | string (GUID) | Filter by owner |
| `mine` | boolean | Get all milestones owned by current user |

**Parameters that DO NOT EXIST** (despite appearing in some documentation):
- `opportunityIds` (plural array) — use `crm_query` with OR filters instead
- `statusFilter` — use `crm_query` with `msp_milestonestatus` filter instead
- `taskFilter` — not supported; use `get_milestone_activities` after retrieving milestones
- `format` — not supported

## Deal Team: Opportunity vs. Milestone Ownership

MSX has **two distinct deal team concepts** that are often conflated. The agent must distinguish them clearly.

### Opportunity Deal Team (NOT reliably retrievable)
The formal deal team lives at the **opportunity level**. Being on the opportunity deal team grants visibility and accountability for the entire opportunity. This is the deal team users typically mean when they say "deal team."

**Current limitation:** We do NOT have a reliable MCP tool or OData query pattern to fetch the opportunity deal team roster. The underlying entity/relationship for opportunity deal team members is not exposed through the standard OData entity sets available to us.

When a user asks "who is on the deal team?" or "am I on the deal team?" for an opportunity:
- Acknowledge that **opportunity-level deal team membership cannot be reliably retrieved** via current tooling.
- Suggest the user check the deal team directly in the MSX UI (Opportunity → Deal Team tab).
- Offer to show **milestone ownership** as a partial proxy (see below).

### Milestone Deal Team (retrievable via `_ownerid_value`)
Each engagement milestone has an **owner** (`_ownerid_value` on `msp_engagementmilestones`). Owning a milestone means you are part of the milestone-level execution team.

**Key distinction:** Being assigned as a milestone owner does **NOT** automatically add you to the opportunity deal team. These are separate relationships in MSX.

The `get_my_active_opportunities` tool uses milestone ownership as a **heuristic** to infer deal team membership — it finds opportunities where the user owns milestones and tags them as `relationship: 'deal-team'`. This is useful but not equivalent to the real opportunity deal team.

### What we CAN do
| Question | Tool / Approach | Reliability |
|---|---|---|
| Who owns milestones on this opportunity? | `get_milestones({ opportunityId })` → `_ownerid_value` | Reliable |
| Which opportunities am I involved in? | `get_my_active_opportunities()` | Reliable (owner + milestone heuristic) |
| Who is on the opportunity deal team? | ❌ Not available via MCP | Cannot retrieve |
| Am I on the opportunity deal team? | ❌ Not available via MCP | Cannot retrieve |

## Dynamic Schema Discovery
When a property is not listed above, use the `crm_list_entity_properties` MCP tool:
```
crm_list_entity_properties({ entityLogicalName: "account", filter: "tpid" })
```
This returns all matching properties with their logical names and types.
