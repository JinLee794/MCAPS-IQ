// MCP tool definitions — maps CRM operations to MCP tools
// Each tool receives validated params and calls createCrmClient methods

import { z } from 'zod';
import { isValidGuid, normalizeGuid, isValidTpid, sanitizeODataString } from './validation.js';
import { getApprovalQueue } from './approval-queue.js';

const MILESTONE_SELECT = [
  'msp_engagementmilestoneid',
  'msp_milestonenumber',
  'msp_name',
  '_msp_workloadlkid_value',
  'msp_commitmentrecommendation',
  'msp_milestonecategory',
  'msp_monthlyuse',
  'msp_milestonedate',
  'msp_milestonestatus',
  '_ownerid_value',
  '_msp_opportunityid_value',
  'msp_forecastcommentsjsonfield',
  'msp_forecastcomments'
].join(',');

const OPP_SELECT = [
  'opportunityid', 'name', 'estimatedclosedate',
  'msp_estcompletiondate', 'msp_consumptionconsumedrecurring',
  '_ownerid_value', '_parentaccountid_value', 'msp_salesplay'
].join(',');

const TASK_CATEGORIES = [
  { label: 'Technical Close/Win Plan', value: 606820005 },
  { label: 'Architecture Design Session', value: 861980004 },
  { label: 'Blocker Escalation', value: 861980006 },
  { label: 'Briefing', value: 861980008 },
  { label: 'Consumption Plan', value: 861980007 },
  { label: 'Demo', value: 861980002 },
  { label: 'PoC/Pilot', value: 861980005 },
  { label: 'Workshop', value: 861980001 }
];

const text = (content) => ({ content: [{ type: 'text', text: typeof content === 'string' ? content : JSON.stringify(content, null, 2) }] });
const error = (msg) => ({ content: [{ type: 'text', text: msg }], isError: true });

function monthKey(dateValue) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 7);
}

function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function fv(record, field) {
  return record[`${field}@OData.Community.Display.V1.FormattedValue`] ?? null;
}

/** Returns ISO date string for (today - days). */
function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

const ACTIVE_STATUSES = new Set(['Not Started', 'In Progress', 'Blocked', 'At Risk']);

/** Derive human-readable commitment label from a milestone record. */
function commitmentLabel(m) {
  return m.msp_commitmentrecommendation === 861980001 ? 'Committed' : 'Uncommitted';
}

function buildMilestoneSummary(milestones) {
  const byStatus = {};
  const byOpportunity = {};
  const byCommitment = { Committed: 0, Uncommitted: 0 };
  for (const m of milestones) {
    const status = fv(m, 'msp_milestonestatus') || 'Unknown';
    byStatus[status] = (byStatus[status] || 0) + 1;
    const opp = fv(m, '_msp_opportunityid_value') || 'Unknown';
    byOpportunity[opp] = (byOpportunity[opp] || 0) + 1;
    byCommitment[commitmentLabel(m)] += 1;
  }
  return {
    count: milestones.length,
    byStatus,
    byCommitment,
    byOpportunity,
    milestones: milestones.map(m => ({
      ...m,
      status: fv(m, 'msp_milestonestatus'),
      commitment: commitmentLabel(m),
      opportunity: fv(m, '_msp_opportunityid_value')
    }))
  };
}

async function applyTaskFilter(crmClient, milestones, mode) {
  if (!milestones.length) return milestones;
  const msIds = milestones.map(m => m.msp_engagementmilestoneid).filter(Boolean);
  const chunks = [];
  for (let i = 0; i < msIds.length; i += 25) chunks.push(msIds.slice(i, i + 25));
  const taskMatches = new Set();
  for (const chunk of chunks) {
    const tf = chunk.map(id => `_regardingobjectid_value eq '${id}'`).join(' or ');
    const taskResult = await crmClient.requestAllPages('tasks', {
      query: { $filter: tf, $select: '_regardingobjectid_value' }
    });
    if (taskResult.ok && taskResult.data?.value) {
      for (const t of taskResult.data.value) taskMatches.add(t._regardingobjectid_value);
    }
  }
  if (mode === 'without-tasks') {
    return milestones.filter(m => !taskMatches.has(m.msp_engagementmilestoneid));
  }
  return milestones.filter(m => taskMatches.has(m.msp_engagementmilestoneid));
}

/**
 * Register all CRM tools on an McpServer instance.
 */
export function registerTools(server, crmClient) {
  // ── crm_whoami ──────────────────────────────────────────────
  server.tool(
    'crm_whoami',
    'Validate CRM access and return the current user identity (UserId, name).',
    {},
    async () => {
      const result = await crmClient.request('WhoAmI');
      if (!result.ok) return error(`WhoAmI failed: ${result.data?.message || result.status}`);
      return text(result.data);
    }
  );

  // ── crm_query ───────────────────────────────────────────────
  server.tool(
    'crm_query',
    'Execute a read-only OData GET against any Dynamics 365 entity set. Supports $filter, $select, $orderby, $top, $expand. Auto-paginates results.',
    {
      entitySet: z.string().describe('Entity set name, e.g. "opportunities", "accounts", "msp_engagementmilestones"'),
      filter: z.string().optional().describe('OData $filter expression'),
      select: z.string().optional().describe('Comma-separated field names for $select'),
      orderby: z.string().optional().describe('OData $orderby expression'),
      top: z.number().optional().describe('Maximum number of records to return'),
      expand: z.string().optional().describe('OData $expand expression')
    },
    async ({ entitySet, filter, select, orderby, top, expand }) => {
      if (!entitySet) return error('entitySet is required');
      const query = {};
      if (filter) query.$filter = filter;
      if (select) query.$select = select;
      if (orderby) query.$orderby = orderby;
      if (top) query.$top = String(top);
      if (expand) query.$expand = expand;

      const result = await crmClient.requestAllPages(entitySet, { query });
      if (!result.ok) return error(`Query failed (${result.status}): ${result.data?.message}`);

      const records = result.data?.value || (result.data ? [result.data] : []);
      return text({ count: records.length, value: records });
    }
  );

  // ── crm_get_record ──────────────────────────────────────────
  server.tool(
    'crm_get_record',
    'Retrieve a single Dynamics 365 record by entity set and GUID.',
    {
      entitySet: z.string().describe('Entity set name, e.g. "opportunities", "accounts"'),
      id: z.string().describe('Record GUID'),
      select: z.string().optional().describe('Comma-separated field names for $select')
    },
    async ({ entitySet, id, select }) => {
      if (!entitySet) return error('entitySet is required');
      const normalized = normalizeGuid(id);
      if (!isValidGuid(normalized)) return error('Invalid GUID');
      const query = {};
      if (select) query.$select = select;
      const result = await crmClient.request(`${entitySet}(${normalized})`, { query });
      if (!result.ok) return error(`Get record failed (${result.status}): ${result.data?.message}`);
      return text(result.data);
    }
  );

  // ── list_opportunities ──────────────────────────────────────
  server.tool(
    'list_opportunities',
    'List open opportunities for one or more account IDs or by customer name keyword. Returns opportunity name, dates, owner, solution play.',
    {
      accountIds: z.array(z.string()).optional().describe('Array of Dynamics 365 account GUIDs'),
      customerKeyword: z.string().optional().describe('Customer name keyword — resolves matching accounts internally'),
      includeCompleted: z.boolean().optional().default(false).describe('Include opportunities past their estimated completion date (default: false)')
    },
    async ({ accountIds, customerKeyword, includeCompleted }) => {
      let resolvedIds = accountIds ? accountIds.map(normalizeGuid).filter(isValidGuid) : [];

      // Resolve customerKeyword → account GUIDs
      if (!resolvedIds.length && customerKeyword) {
        const sanitized = sanitizeODataString(customerKeyword.trim());
        const acctResult = await crmClient.requestAllPages('accounts', {
          query: { $filter: `contains(name,'${sanitized}')`, $select: 'accountid,name', $top: '50' }
        });
        const matchedAccounts = acctResult.ok ? (acctResult.data?.value || []) : [];
        if (!matchedAccounts.length) {
          return text({ count: 0, opportunities: [], matchedAccounts: [], message: `No accounts found matching '${customerKeyword}'` });
        }
        resolvedIds = matchedAccounts.map(a => a.accountid);
      }

      if (!resolvedIds.length) return error('Provide accountIds array or customerKeyword');

      // Chunk into groups of 25 to keep filter URL manageable
      const chunks = [];
      for (let i = 0; i < resolvedIds.length; i += 25) chunks.push(resolvedIds.slice(i, i + 25));

      const allOpps = [];
      for (const chunk of chunks) {
        let filter = `(${chunk.map(id => `_parentaccountid_value eq '${id}'`).join(' or ')}) and statecode eq 0`;
        if (!includeCompleted) {
          filter += ` and msp_estcompletiondate ge ${daysAgo(30)}`;
        }
        const result = await crmClient.requestAllPages('opportunities', {
          query: { $filter: filter, $select: OPP_SELECT, $orderby: 'name' }
        });
        if (result.ok && result.data?.value) allOpps.push(...result.data.value);
      }

      return text({ count: allOpps.length, opportunities: allOpps });
    }
  );

  // ── get_milestones ──────────────────────────────────────────
  server.tool(
    'get_milestones',
    'Get engagement milestones by milestoneId, milestone number, opportunity, or owner. Supports batch opportunityIds, status/keyword filtering, and task-presence filtering.',
    {
      opportunityId: z.string().optional().describe('Opportunity GUID to list milestones for'),
      opportunityIds: z.array(z.string()).optional().describe('Array of opportunity GUIDs for batch milestone retrieval'),
      milestoneNumber: z.string().optional().describe('Milestone number to search for, e.g. "7-123456789"'),
      milestoneId: z.string().optional().describe('Direct milestone GUID lookup'),
      ownerId: z.string().optional().describe('Owner system user GUID to list milestones for'),
      mine: z.boolean().optional().describe('When true (default), returns milestones owned by the authenticated CRM user if no other filter is provided'),
      statusFilter: z.enum(['active', 'all']).optional().describe('Filter by status: active = Not Started/In Progress/Blocked/At Risk'),
      keyword: z.string().optional().describe('Case-insensitive keyword filter across milestone name, opportunity, and workload'),
      format: z.enum(['full', 'summary']).optional().describe('Response format: full (default) or summary (grouped compact output)'),
      taskFilter: z.enum(['all', 'with-tasks', 'without-tasks']).optional().describe('Filter milestones by task presence')
    },
    async ({ opportunityId, opportunityIds, milestoneNumber, milestoneId, ownerId, mine, statusFilter, keyword, format, taskFilter: taskFilterParam }) => {
      // Direct GUID lookup
      if (milestoneId) {
        const nid = normalizeGuid(milestoneId);
        if (!isValidGuid(nid)) return error('Invalid milestoneId GUID');
        const result = await crmClient.request(`msp_engagementmilestones(${nid})`, {
          query: { $select: MILESTONE_SELECT }
        });
        if (!result.ok) return error(`Milestone lookup failed (${result.status}): ${result.data?.message}`);
        return text({ ...result.data, commitment: commitmentLabel(result.data) });
      }

      let filter;
      if (milestoneNumber) {
        const sanitized = sanitizeODataString(milestoneNumber.trim());
        filter = `msp_milestonenumber eq '${sanitized}'`;
      } else if (opportunityIds?.length) {
        const validIds = opportunityIds.map(normalizeGuid).filter(isValidGuid);
        if (!validIds.length) return error('No valid opportunity GUIDs in opportunityIds');
        const chunks = [];
        for (let i = 0; i < validIds.length; i += 25) chunks.push(validIds.slice(i, i + 25));
        const allMilestones = [];
        for (const chunk of chunks) {
          const chunkFilter = chunk.map(id => `_msp_opportunityid_value eq '${id}'`).join(' or ');
          const chunkResult = await crmClient.requestAllPages('msp_engagementmilestones', {
            query: { $filter: chunkFilter, $select: MILESTONE_SELECT, $orderby: 'msp_milestonedate' }
          });
          if (chunkResult.ok && chunkResult.data?.value) allMilestones.push(...chunkResult.data.value);
        }
        let milestones = allMilestones;
        if (statusFilter === 'active') {
          milestones = milestones.filter(m => ACTIVE_STATUSES.has(fv(m, 'msp_milestonestatus')));
        }
        if (keyword) {
          const kw = keyword.toLowerCase();
          milestones = milestones.filter(m =>
            (m.msp_name || '').toLowerCase().includes(kw) ||
            (fv(m, '_msp_opportunityid_value') || '').toLowerCase().includes(kw) ||
            (fv(m, '_msp_workloadlkid_value') || '').toLowerCase().includes(kw)
          );
        }
        if (taskFilterParam && taskFilterParam !== 'all') {
          milestones = await applyTaskFilter(crmClient, milestones, taskFilterParam);
        }
        if (format === 'summary') return text(buildMilestoneSummary(milestones));
        return text({ count: milestones.length, milestones: milestones.map(m => ({ ...m, commitment: commitmentLabel(m) })) });
      } else if (opportunityId) {
        const nid = normalizeGuid(opportunityId);
        if (!isValidGuid(nid)) return error('Invalid opportunityId GUID');
        filter = `_msp_opportunityid_value eq '${nid}'`;
      } else if (ownerId) {
        const nid = normalizeGuid(ownerId);
        if (!isValidGuid(nid)) return error('Invalid ownerId GUID');
        filter = `_ownerid_value eq '${nid}'`;
      } else if (mine !== false) {
        const whoAmI = await crmClient.request('WhoAmI');
        if (!whoAmI.ok || !whoAmI.data?.UserId) {
          return error(`Unable to resolve current CRM user for milestone lookup (${whoAmI.status}): ${whoAmI.data?.message || 'WhoAmI failed'}`);
        }
        const nid = normalizeGuid(whoAmI.data.UserId);
        filter = `_ownerid_value eq '${nid}'`;
      } else {
        return error('Provide opportunityId, milestoneNumber, milestoneId, ownerId, or set mine=true');
      }

      const result = await crmClient.requestAllPages('msp_engagementmilestones', {
        query: { $filter: filter, $select: MILESTONE_SELECT, $orderby: 'msp_milestonedate' }
      });
      if (!result.ok) return error(`Get milestones failed (${result.status}): ${result.data?.message}`);
      let milestones = result.data?.value || [];

      // Post-query filters
      if (statusFilter === 'active') {
        milestones = milestones.filter(m => ACTIVE_STATUSES.has(fv(m, 'msp_milestonestatus')));
      }
      if (keyword) {
        const kw = keyword.toLowerCase();
        milestones = milestones.filter(m =>
          (m.msp_name || '').toLowerCase().includes(kw) ||
          (fv(m, '_msp_opportunityid_value') || '').toLowerCase().includes(kw) ||
          (fv(m, '_msp_workloadlkid_value') || '').toLowerCase().includes(kw)
        );
      }
      if (taskFilterParam && taskFilterParam !== 'all') {
        milestones = await applyTaskFilter(crmClient, milestones, taskFilterParam);
      }
      if (format === 'summary') return text(buildMilestoneSummary(milestones));
      return text({ count: milestones.length, milestones: milestones.map(m => ({ ...m, commitment: commitmentLabel(m) })) });
    }
  );

  // ── get_my_active_opportunities ─────────────────────────────
  server.tool(
    'get_my_active_opportunities',
    'Returns active opportunities where you are the owner or have milestone ownership (used as a heuristic for deal-team involvement — note: this does NOT query the actual opportunity-level deal team, which is not retrievable via OData). Optionally filter by customer name.',
    {
      customerKeyword: z.string().optional().describe('Case-insensitive customer name filter')
    },
    async ({ customerKeyword }) => {
      const whoAmI = await crmClient.request('WhoAmI');
      if (!whoAmI.ok || !whoAmI.data?.UserId) {
        return error(`Unable to resolve current CRM user (${whoAmI.status}): ${whoAmI.data?.message || 'WhoAmI failed'}`);
      }
      const userId = normalizeGuid(whoAmI.data.UserId);

      // 1. Owned opportunities (exclude completion dates > 30 days ago)
      const cutoff = daysAgo(30);
      const ownedResult = await crmClient.requestAllPages('opportunities', {
        query: { $filter: `_ownerid_value eq '${userId}' and statecode eq 0 and msp_estcompletiondate ge ${cutoff}`, $select: OPP_SELECT, $orderby: 'name' }
      });
      const ownedOpps = (ownedResult.ok ? ownedResult.data?.value : []) || [];
      const ownedIds = new Set(ownedOpps.map(o => o.opportunityid));

      // 2. Discover deal-team opps via milestones owned by user
      const msResult = await crmClient.requestAllPages('msp_engagementmilestones', {
        query: { $filter: `_ownerid_value eq '${userId}'`, $select: '_msp_opportunityid_value' }
      });
      const dealTeamOppIds = [];
      if (msResult.ok && msResult.data?.value) {
        for (const m of msResult.data.value) {
          const oppId = m._msp_opportunityid_value;
          if (oppId && !ownedIds.has(oppId) && !dealTeamOppIds.includes(oppId)) dealTeamOppIds.push(oppId);
        }
      }

      // 3. Fetch deal-team opportunities
      let dealTeamOpps = [];
      if (dealTeamOppIds.length) {
        const dtFilter = dealTeamOppIds.map(id => `opportunityid eq '${id}'`).join(' or ');
        const dtResult = await crmClient.requestAllPages('opportunities', {
          query: { $filter: `(${dtFilter}) and statecode eq 0 and msp_estcompletiondate ge ${cutoff}`, $select: OPP_SELECT, $orderby: 'name' }
        });
        if (dtResult.ok && dtResult.data?.value) dealTeamOpps = dtResult.data.value;
      }

      // 4. Combine and tag
      let opportunities = [
        ...ownedOpps.map(o => ({
          ...o,
          customer: fv(o, '_parentaccountid_value') || null,
          relationship: 'owner'
        })),
        ...dealTeamOpps.map(o => ({
          ...o,
          customer: fv(o, '_parentaccountid_value') || null,
          relationship: 'deal-team'
        }))
      ];

      // 5. Filter by customerKeyword
      if (customerKeyword) {
        const kw = customerKeyword.toLowerCase();
        opportunities = opportunities.filter(o => (o.customer || '').toLowerCase().includes(kw));
      }

      return text({ count: opportunities.length, opportunities });
    }
  );

  // ── create_task ─────────────────────────────────────────────
  server.tool(
    'create_milestone',
    'Create an engagement milestone linked to an opportunity. Supports date, monthly use, status, category, commitment, owner, workload, and comments.',
    {
      opportunityId: z.string().describe('Opportunity GUID to link the milestone to'),
      name: z.string().describe('Milestone name/title'),
      milestoneDate: z.string().optional().describe('Milestone date in YYYY-MM-DD format'),
      monthlyUse: z.number().optional().describe('Monthly use value'),
      milestoneCategory: z.number().optional().describe('Milestone category code'),
      commitmentRecommendation: z.number().optional().describe('Commitment recommendation code'),
      milestoneStatus: z.number().optional().describe('Milestone status code'),
      workloadId: z.string().optional().describe('Workload GUID'),
      ownerId: z.string().optional().describe('System user GUID to assign as owner'),
      transactionCurrencyId: z.string().optional().describe('Transaction currency GUID'),
      forecastComments: z.string().optional().describe('Forecast comments text')
    },
    async ({
      opportunityId,
      name,
      milestoneDate,
      monthlyUse,
      milestoneCategory,
      commitmentRecommendation,
      milestoneStatus,
      workloadId,
      ownerId,
      transactionCurrencyId,
      forecastComments
    }) => {
      const oppNid = normalizeGuid(opportunityId);
      if (!isValidGuid(oppNid)) return error('Invalid opportunityId GUID');
      if (!name) return error('name is required');

      const oppLookup = await crmClient.request(`opportunities(${oppNid})`, {
        query: { $select: 'name' }
      });
      if (!oppLookup.ok) {
        return error(`Opportunity lookup failed (${oppLookup.status}): ${oppLookup.data?.message || 'not found'}`);
      }
      const opportunityName = oppLookup.data?.name || null;

      const payload = {
        msp_name: name,
        'msp_OpportunityId@odata.bind': `/opportunities(${oppNid})`
      };

      if (milestoneDate !== undefined) payload.msp_milestonedate = milestoneDate;
      if (monthlyUse !== undefined) payload.msp_monthlyuse = monthlyUse;
      if (milestoneCategory !== undefined) payload.msp_milestonecategory = milestoneCategory;
      if (commitmentRecommendation !== undefined) payload.msp_commitmentrecommendation = commitmentRecommendation;
      if (milestoneStatus !== undefined) payload.msp_milestonestatus = milestoneStatus;
      if (forecastComments !== undefined) payload.msp_forecastcomments = forecastComments;

      if (workloadId) {
        const workloadNid = normalizeGuid(workloadId);
        if (!isValidGuid(workloadNid)) return error('Invalid workloadId GUID');
        payload['msp_WorkloadlkId@odata.bind'] = `/msp_workloads(${workloadNid})`;
      }

      if (ownerId) {
        const ownerNid = normalizeGuid(ownerId);
        if (!isValidGuid(ownerNid)) return error('Invalid ownerId GUID');
        payload['ownerid@odata.bind'] = `/systemusers(${ownerNid})`;
      }

      if (transactionCurrencyId) {
        const currencyNid = normalizeGuid(transactionCurrencyId);
        if (!isValidGuid(currencyNid)) return error('Invalid transactionCurrencyId GUID');
        payload['transactioncurrencyid@odata.bind'] = `/transactioncurrencies(${currencyNid})`;
      }

      const queue = getApprovalQueue();
      const op = queue.stage({
        type: 'create_milestone',
        entitySet: 'msp_engagementmilestones',
        method: 'POST',
        payload,
        beforeState: null,
        description: `Create milestone "${name}" on opportunity ${opportunityName || oppNid}`
      });

      return text({
        staged: true,
        operationId: op.id,
        description: op.description,
        identity: {
          opportunityId: oppNid,
          opportunityName
        },
        payload,
        message: `Staged ${op.id}: ${op.description}. Approve via execute_operation or from the approval UI.`
      });
    }
  );

  // ── create_task ─────────────────────────────────────────────
  server.tool(
    'create_task',
    'Create a task linked to an engagement milestone. Optionally specify category, subject, due date, and owner.',
    {
      milestoneId: z.string().describe('Engagement milestone GUID to link the task to'),
      subject: z.string().describe('Task subject/title'),
      category: z.number().optional().describe(`Task category code. Valid values: ${TASK_CATEGORIES.map(c => `${c.value} (${c.label})`).join(', ')}`),
      dueDate: z.string().optional().describe('Due date in YYYY-MM-DD format'),
      ownerId: z.string().optional().describe('System user GUID to assign as owner'),
      description: z.string().optional().describe('Task description')
    },
    async ({ milestoneId, subject, category, dueDate, ownerId, description }) => {
      const nid = normalizeGuid(milestoneId);
      if (!isValidGuid(nid)) return error('Invalid milestoneId GUID');
      if (!subject) return error('subject is required');

      const payload = {
        subject,
        'regardingobjectid_msp_engagementmilestone@odata.bind': `/msp_engagementmilestones(${nid})`
      };
      if (category !== undefined) payload.msp_taskcategory = category;
      if (dueDate) payload.scheduledend = dueDate;
      if (description) payload.description = description;
      if (ownerId) {
        const ownerNid = normalizeGuid(ownerId);
        if (!isValidGuid(ownerNid)) return error('Invalid ownerId GUID');
        payload['ownerid@odata.bind'] = `/systemusers(${ownerNid})`;
      }

      const queue = getApprovalQueue();
      const op = queue.stage({
        type: 'create_task',
        entitySet: 'tasks',
        method: 'POST',
        payload,
        beforeState: null,
        description: `Create task "${subject}" on milestone ${nid}`
      });
      return text({
        staged: true,
        operationId: op.id,
        description: op.description,
        payload,
        message: `Staged ${op.id}: ${op.description}. Approve via execute_operation or from the approval UI.`
      });
    }
  );

  // ── update_task ─────────────────────────────────────────────
  server.tool(
    'update_task',
    'Update fields on an existing task (subject, due date, description, status).',
    {
      taskId: z.string().describe('Task GUID'),
      subject: z.string().optional().describe('New subject'),
      dueDate: z.string().optional().describe('New due date YYYY-MM-DD'),
      description: z.string().optional().describe('New description'),
      statusCode: z.number().optional().describe('New status code')
    },
    async ({ taskId, subject, dueDate, description, statusCode }) => {
      const nid = normalizeGuid(taskId);
      if (!isValidGuid(nid)) return error('Invalid taskId GUID');
      const payload = {};
      if (subject !== undefined) payload.subject = subject;
      if (dueDate !== undefined) payload.scheduledend = dueDate;
      if (description !== undefined) payload.description = description;
      if (statusCode !== undefined) payload.statuscode = statusCode;
      if (Object.keys(payload).length === 0) return error('No fields to update');

      // Fetch before-state for diff preview
      const before = await crmClient.request(`tasks(${nid})`, {
        query: { $select: Object.keys(payload).join(',') }
      });

      const queue = getApprovalQueue();
      const op = queue.stage({
        type: 'update_task',
        entitySet: `tasks(${nid})`,
        method: 'PATCH',
        payload,
        beforeState: before.ok ? before.data : null,
        description: `Update task ${nid}: ${Object.keys(payload).join(', ')}`
      });
      return text({
        staged: true,
        operationId: op.id,
        description: op.description,
        before: op.beforeState,
        after: payload,
        message: `Staged ${op.id}: ${op.description}. Approve via execute_operation or from the approval UI.`
      });
    }
  );

  // ── close_task ──────────────────────────────────────────────
  server.tool(
    'close_task',
    'Close a task using the CloseTask action (with fallback to bound Close endpoint).',
    {
      taskId: z.string().describe('Task GUID'),
      statusCode: z.number().describe('Status code for the closure (e.g. 5 = Completed, 6 = Cancelled)'),
      subject: z.string().optional().describe('Close subject (defaults to "Task Closed")')
    },
    async ({ taskId, statusCode, subject }) => {
      const nid = normalizeGuid(taskId);
      if (!isValidGuid(nid)) return error('Invalid taskId GUID');
      if (statusCode === undefined) return error('statusCode is required');

      // Fetch before-state
      const before = await crmClient.request(`tasks(${nid})`, {
        query: { $select: 'subject,statuscode,statecode' }
      });

      // Stage with CloseTask action as primary strategy
      const closePayload = {
        TaskClose: {
          subject: subject || 'Task Closed',
          'activityid@odata.bind': `/tasks(${nid})`
        },
        Status: statusCode
      };

      const queue = getApprovalQueue();
      const op = queue.stage({
        type: 'close_task',
        entitySet: 'CloseTask',
        method: 'POST',
        payload: closePayload,
        beforeState: before.ok ? before.data : null,
        description: `Close task ${nid} with status ${statusCode}`
      });
      // Attach fallback info for executor
      op.fallbackEntitySet = `tasks(${nid})/Microsoft.Dynamics.CRM.Close`;
      op.fallbackPayload = { Status: statusCode };

      return text({
        staged: true,
        operationId: op.id,
        description: op.description,
        before: op.beforeState,
        statusCode,
        message: `Staged ${op.id}: ${op.description}. Approve via execute_operation or from the approval UI.`
      });
    }
  );

  // ── update_milestone ────────────────────────────────────────
  server.tool(
    'update_milestone',
    'Update fields on an engagement milestone (date, monthly use, comments).',
    {
      milestoneId: z.string().describe('Engagement milestone GUID'),
      milestoneDate: z.string().optional().describe('New milestone date YYYY-MM-DD'),
      monthlyUse: z.number().optional().describe('New monthly use value'),
      forecastComments: z.string().optional().describe('Forecast comments text')
    },
    async ({ milestoneId, milestoneDate, monthlyUse, forecastComments }) => {
      const nid = normalizeGuid(milestoneId);
      if (!isValidGuid(nid)) return error('Invalid milestoneId GUID');
      const payload = {};
      if (milestoneDate !== undefined) payload.msp_milestonedate = milestoneDate;
      if (monthlyUse !== undefined) payload.msp_monthlyuse = monthlyUse;
      if (forecastComments !== undefined) payload.msp_forecastcomments = forecastComments;
      if (Object.keys(payload).length === 0) return error('No fields to update');

      // Fetch full milestone record for identity verification + before-state
      const fullRecord = await crmClient.request(`msp_engagementmilestones(${nid})`, {
        query: { $select: MILESTONE_SELECT }
      });
      if (!fullRecord.ok) {
        return error(`Milestone ${nid} not found or inaccessible (${fullRecord.status}): ${fullRecord.data?.message || 'lookup failed'}`);
      }

      const record = fullRecord.data;
      const milestoneNumber = record.msp_milestonenumber || null;
      const milestoneName = record.msp_name || null;
      const milestoneOppId = record._msp_opportunityid_value || null;
      const milestoneOwnerId = record._ownerid_value || null;
      const opportunityName = fv(record, '_msp_opportunityid_value') || null;

      // Ownership verification: ensure current user owns milestone or is on deal team
      const whoAmI = await crmClient.request('WhoAmI');
      if (whoAmI.ok && whoAmI.data?.UserId) {
        const currentUserId = normalizeGuid(whoAmI.data.UserId);
        const isOwner = milestoneOwnerId && normalizeGuid(milestoneOwnerId) === currentUserId;

        if (!isOwner && milestoneOppId) {
          // Check if user owns the opportunity or any milestones under it
          const oppResult = await crmClient.request(`opportunities(${normalizeGuid(milestoneOppId)})`, {
            query: { $select: '_ownerid_value' }
          });
          const oppOwnerId = oppResult.ok ? normalizeGuid(oppResult.data?._ownerid_value || '') : '';
          const isOppOwner = oppOwnerId === currentUserId;

          if (!isOppOwner) {
            const teamCheck = await crmClient.requestAllPages('msp_engagementmilestones', {
              query: {
                $filter: `_msp_opportunityid_value eq '${normalizeGuid(milestoneOppId)}' and _ownerid_value eq '${currentUserId}'`,
                $select: 'msp_engagementmilestoneid',
                $top: '1'
              }
            });
            const isOnDealTeam = teamCheck.ok && teamCheck.data?.value?.length > 0;
            if (!isOnDealTeam) {
              return error(
                `Ownership check failed: milestone ${milestoneNumber || nid} ("${milestoneName || 'unknown'}") ` +
                `under opportunity "${opportunityName || milestoneOppId}" is not owned by you and you are not on the deal team. ` +
                `Verify you have the correct milestone ID.`
              );
            }
          }
        } else if (!isOwner && !milestoneOppId) {
          return error(
            `Ownership check failed: milestone ${milestoneNumber || nid} is not owned by you ` +
            `and has no linked opportunity for deal-team verification.`
          );
        }
      }

      // Build before-state limited to fields being changed
      const before = {};
      for (const key of Object.keys(payload)) {
        before[key] = record[key] ?? null;
      }

      // Identity metadata for pre-execution verification
      const identity = {
        milestoneNumber,
        milestoneName,
        opportunityId: milestoneOppId,
        opportunityName,
      };

      const humanDesc = `Update milestone ${milestoneNumber || nid}` +
        (milestoneName ? ` ("${milestoneName}")` : '') +
        (opportunityName ? ` on "${opportunityName}"` : '') +
        `: ${Object.keys(payload).join(', ')}`;

      const queue = getApprovalQueue();
      const op = queue.stage({
        type: 'update_milestone',
        entitySet: `msp_engagementmilestones(${nid})`,
        method: 'PATCH',
        payload,
        beforeState: before,
        description: humanDesc
      });
      // Attach identity for execution-time re-verification
      op.identity = identity;

      return text({
        staged: true,
        operationId: op.id,
        description: op.description,
        identity,
        before,
        after: payload,
        message: `Staged ${op.id}: ${op.description}. Approve via execute_operation or from the approval UI.`
      });
    }
  );

  // ── list_accounts_by_tpid ───────────────────────────────────
  server.tool(
    'list_accounts_by_tpid',
    'Find accounts by MS Top Parent ID (TPID). Returns account GUIDs and names.',
    {
      tpids: z.array(z.string()).describe('Array of TPID values (numeric strings)')
    },
    async ({ tpids }) => {
      if (!tpids?.length) return error('At least one TPID is required');
      const valid = tpids.filter(isValidTpid);
      if (!valid.length) return error('No valid TPIDs provided');

      const filter = valid.map(t => `msp_mstopparentid eq '${sanitizeODataString(t)}'`).join(' or ');
      const result = await crmClient.requestAllPages('accounts', {
        query: {
          $filter: filter,
          $select: 'accountid,name,msp_mstopparentid',
          $orderby: 'name'
        }
      });
      if (!result.ok) return error(`Account lookup failed (${result.status}): ${result.data?.message}`);
      const accounts = result.data?.value || [];
      return text({ count: accounts.length, accounts });
    }
  );

  // ── get_task_status_options ─────────────────────────────────
  server.tool(
    'get_task_status_options',
    'Retrieve available task status/statuscode options from Dynamics 365 metadata.',
    {},
    async () => {
      const result = await crmClient.request(
        "EntityDefinitions(LogicalName='task')/Attributes(LogicalName='statuscode')/Microsoft.Dynamics.CRM.StatusAttributeMetadata",
        { query: { $select: 'LogicalName', $expand: 'OptionSet($select=Options)' } }
      );
      if (!result.ok) return error(`Metadata query failed (${result.status}): ${result.data?.message}`);

      const options = result.data?.OptionSet?.Options || [];
      const parsed = options
        .map(o => ({
          value: o?.Value,
          label: o?.Label?.UserLocalizedLabel?.Label || o?.Label?.LocalizedLabels?.[0]?.Label || '',
          stateCode: o?.State
        }))
        .filter(o => Number.isInteger(o.value) && o.label);
      return text(parsed);
    }
  );

  // ── get_milestone_activities ────────────────────────────────
  server.tool(
    'get_milestone_activities',
    'List tasks/activities linked to one or more engagement milestones. Supports batch retrieval via milestoneIds array.',
    {
      milestoneId: z.string().optional().describe('Single engagement milestone GUID'),
      milestoneIds: z.array(z.string()).optional().describe('Array of milestone GUIDs for batch retrieval')
    },
    async ({ milestoneId, milestoneIds }) => {
      // Batch mode
      if (milestoneIds?.length) {
        const validIds = milestoneIds.map(normalizeGuid).filter(isValidGuid);
        if (!validIds.length) return error('No valid milestone GUIDs in milestoneIds');
        const chunks = [];
        for (let i = 0; i < validIds.length; i += 25) chunks.push(validIds.slice(i, i + 25));
        const allTasks = [];
        for (const chunk of chunks) {
          const batchFilter = chunk.map(id => `_regardingobjectid_value eq '${id}'`).join(' or ');
          const batchResult = await crmClient.requestAllPages('tasks', {
            query: {
              $filter: batchFilter,
              $select: 'activityid,subject,scheduledend,statuscode,statecode,_ownerid_value,description,msp_taskcategory,_regardingobjectid_value',
              $orderby: 'createdon desc'
            }
          });
          if (batchResult.ok && batchResult.data?.value) allTasks.push(...batchResult.data.value);
        }
        // Group by milestone
        const byMilestone = {};
        for (const t of allTasks) {
          const msId = t._regardingobjectid_value;
          if (!byMilestone[msId]) byMilestone[msId] = [];
          byMilestone[msId].push(t);
        }
        return text({ count: allTasks.length, byMilestone });
      }

      // Single mode (backward-compatible)
      if (!milestoneId) return error('Provide milestoneId or milestoneIds');
      const nid = normalizeGuid(milestoneId);
      if (!isValidGuid(nid)) return error('Invalid milestoneId GUID');

      const filter = `_regardingobjectid_value eq '${nid}'`;
      const result = await crmClient.requestAllPages('tasks', {
        query: {
          $filter: filter,
          $select: 'activityid,subject,scheduledend,statuscode,statecode,_ownerid_value,description,msp_taskcategory',
          $orderby: 'createdon desc'
        }
      });
      if (!result.ok) return error(`Get activities failed (${result.status}): ${result.data?.message}`);
      const tasks = result.data?.value || [];
      return text({ count: tasks.length, tasks });
    }
  );

  // ── find_milestones_needing_tasks ───────────────────────────
  server.tool(
    'find_milestones_needing_tasks',
    'Composite tool: resolves customer keywords → accounts → opportunities → milestones, then identifies milestones without linked tasks.',
    {
      customerKeywords: z.array(z.string()).describe('Array of customer name keywords to search'),
      statusFilter: z.enum(['active', 'all']).optional().describe('Milestone status filter (default: active)')
    },
    async ({ customerKeywords, statusFilter = 'active' }) => {
      if (!customerKeywords?.length) return error('At least one customerKeyword is required');

      const customers = [];
      let totalNeedingTasks = 0;

      for (const keyword of customerKeywords) {
        const sanitized = sanitizeODataString(keyword.trim());

        // 1. Resolve accounts
        const acctResult = await crmClient.requestAllPages('accounts', {
          query: { $filter: `contains(name,'${sanitized}')`, $select: 'accountid,name', $top: '50' }
        });
        const accounts = acctResult.ok ? (acctResult.data?.value || []) : [];
        if (!accounts.length) {
          customers.push({ customer: keyword, error: 'No matching accounts found', milestonesNeedingTasks: 0, milestones: [] });
          continue;
        }

        // 2. Get opportunities for matched accounts
        const acctIds = accounts.map(a => a.accountid);
        const acctFilter = acctIds.map(id => `_parentaccountid_value eq '${id}'`).join(' or ');
        const oppResult = await crmClient.requestAllPages('opportunities', {
          query: { $filter: `(${acctFilter}) and statecode eq 0`, $select: OPP_SELECT, $orderby: 'name' }
        });
        const opps = oppResult.ok ? (oppResult.data?.value || []) : [];
        if (!opps.length) {
          customers.push({ customer: keyword, milestonesNeedingTasks: 0, milestones: [], accounts: accounts.map(a => a.name) });
          continue;
        }

        // 3. Get milestones for opportunities
        const oppIds = opps.map(o => o.opportunityid);
        const oppFilter = oppIds.map(id => `_msp_opportunityid_value eq '${id}'`).join(' or ');
        const msResult = await crmClient.requestAllPages('msp_engagementmilestones', {
          query: { $filter: oppFilter, $select: MILESTONE_SELECT, $orderby: 'msp_milestonedate' }
        });
        let milestones = msResult.ok ? (msResult.data?.value || []) : [];

        // Apply status filter
        if (statusFilter === 'active') {
          milestones = milestones.filter(m => ACTIVE_STATUSES.has(fv(m, 'msp_milestonestatus')));
        }

        if (!milestones.length) {
          customers.push({ customer: keyword, milestonesNeedingTasks: 0, milestones: [] });
          continue;
        }

        // 4. Batch task check
        const msIds = milestones.map(m => m.msp_engagementmilestoneid);
        const taskFilter = msIds.map(id => `_regardingobjectid_value eq '${id}'`).join(' or ');
        const taskResult = await crmClient.requestAllPages('tasks', {
          query: { $filter: taskFilter, $select: '_regardingobjectid_value' }
        });
        const taskMsIds = new Set();
        if (taskResult.ok && taskResult.data?.value) {
          for (const t of taskResult.data.value) taskMsIds.add(t._regardingobjectid_value);
        }

        const needingTasks = milestones.filter(m => !taskMsIds.has(m.msp_engagementmilestoneid));
        totalNeedingTasks += needingTasks.length;

        customers.push({
          customer: keyword,
          milestonesNeedingTasks: needingTasks.length,
          totalMilestones: milestones.length,
          milestones: needingTasks.map(m => ({
            id: m.msp_engagementmilestoneid,
            number: m.msp_milestonenumber,
            name: m.msp_name,
            status: fv(m, 'msp_milestonestatus'),
            commitment: commitmentLabel(m),
            date: toIsoDate(m.msp_milestonedate),
            opportunity: fv(m, '_msp_opportunityid_value'),
            workload: fv(m, '_msp_workloadlkid_value')
          }))
        });
      }

      return text({ totalMilestonesNeedingTasks: totalNeedingTasks, customers });
    }
  );

  // ── view_milestone_timeline ─────────────────────────────────
  server.tool(
    'view_milestone_timeline',
    'Return timeline-friendly milestone events for a user or opportunity, with render hints for Copilot UI.',
    {
      ownerId: z.string().optional().describe('System user GUID to filter milestone owner'),
      opportunityId: z.string().optional().describe('Opportunity GUID to filter milestones'),
      fromDate: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      toDate: z.string().optional().describe('End date (YYYY-MM-DD)')
    },
    async ({ ownerId, opportunityId, fromDate, toDate }) => {
      if (!ownerId && !opportunityId) {
        return error('Provide ownerId or opportunityId');
      }

      const filters = [];
      if (ownerId) {
        const ownerNid = normalizeGuid(ownerId);
        if (!isValidGuid(ownerNid)) return error('Invalid ownerId GUID');
        filters.push(`_ownerid_value eq '${ownerNid}'`);
      }

      if (opportunityId) {
        const oppNid = normalizeGuid(opportunityId);
        if (!isValidGuid(oppNid)) return error('Invalid opportunityId GUID');
        filters.push(`_msp_opportunityid_value eq '${oppNid}'`);
      }

      if (fromDate) filters.push(`msp_milestonedate ge ${sanitizeODataString(fromDate)}`);
      if (toDate) filters.push(`msp_milestonedate le ${sanitizeODataString(toDate)}`);

      const result = await crmClient.requestAllPages('msp_engagementmilestones', {
        query: {
          $filter: filters.join(' and '),
          $select: 'msp_engagementmilestoneid,msp_milestonenumber,msp_name,msp_milestonestatus,msp_commitmentrecommendation,msp_milestonedate,msp_monthlyuse,_msp_opportunityid_value',
          $orderby: 'msp_milestonedate asc'
        }
      });
      if (!result.ok) return error(`Timeline query failed (${result.status}): ${result.data?.message}`);

      const milestones = result.data?.value || [];
      const oppIds = [...new Set(milestones.map(m => m._msp_opportunityid_value).filter(Boolean))];
      const opportunityNames = {};

      for (const id of oppIds) {
        const opp = await crmClient.request(`opportunities(${id})`, { query: { $select: 'name' } });
        if (opp.ok && opp.data?.name) opportunityNames[id] = opp.data.name;
      }

      const events = milestones.map(m => ({
        id: m.msp_engagementmilestoneid,
        date: toIsoDate(m.msp_milestonedate),
        title: m.msp_name,
        milestoneNumber: m.msp_milestonenumber,
        status: m['msp_milestonestatus@OData.Community.Display.V1.FormattedValue'] ?? m.msp_milestonestatus,
        commitment: commitmentLabel(m),
        monthlyUse: m.msp_monthlyuse ?? null,
        opportunityId: m._msp_opportunityid_value ?? null,
        opportunityName: opportunityNames[m._msp_opportunityid_value] ?? null
      }));

      return text({
        count: events.length,
        events,
        renderHints: {
          view: 'timeline',
          defaultSort: { field: 'date', direction: 'asc' },
          dateField: 'date',
          titleField: 'title',
          laneField: 'opportunityName',
          statusField: 'status'
        }
      });
    }
  );

  // ── view_opportunity_cost_trend ────────────────────────────
  server.tool(
    'view_opportunity_cost_trend',
    'Return monthly cost/consumption trend points for an opportunity with chart/table render hints.',
    {
      opportunityId: z.string().describe('Opportunity GUID'),
      includeMilestones: z.boolean().optional().describe('Include milestone monthly-use points (default true)')
    },
    async ({ opportunityId, includeMilestones = true }) => {
      const oppNid = normalizeGuid(opportunityId);
      if (!isValidGuid(oppNid)) return error('Invalid opportunityId GUID');

      const opportunityResult = await crmClient.request(`opportunities(${oppNid})`, {
        query: {
          $select: 'opportunityid,name,estimatedclosedate,msp_estcompletiondate,msp_consumptionconsumedrecurring'
        }
      });
      if (!opportunityResult.ok) {
        return error(`Opportunity lookup failed (${opportunityResult.status}): ${opportunityResult.data?.message}`);
      }

      const opportunity = opportunityResult.data || {};
      const byMonth = new Map();

      if (includeMilestones) {
        const milestoneResult = await crmClient.requestAllPages('msp_engagementmilestones', {
          query: {
            $filter: `_msp_opportunityid_value eq '${oppNid}'`,
            $select: 'msp_milestonedate,msp_monthlyuse,msp_name,msp_milestonenumber',
            $orderby: 'msp_milestonedate asc'
          }
        });
        if (!milestoneResult.ok) {
          return error(`Milestone trend query failed (${milestoneResult.status}): ${milestoneResult.data?.message}`);
        }

        for (const milestone of milestoneResult.data?.value || []) {
          const key = monthKey(milestone.msp_milestonedate);
          const amount = Number(milestone.msp_monthlyuse ?? 0);
          if (!key || Number.isNaN(amount)) continue;
          byMonth.set(key, (byMonth.get(key) || 0) + amount);
        }
      }

      const points = [...byMonth.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, planned]) => ({ month, plannedMonthlyUse: planned }));

      const totalPlanned = points.reduce((sum, point) => sum + point.plannedMonthlyUse, 0);
      const consumedRecurring = Number(opportunity.msp_consumptionconsumedrecurring ?? 0);

      return text({
        opportunity: {
          id: opportunity.opportunityid,
          name: opportunity.name,
          estimatedCloseDate: toIsoDate(opportunity.estimatedclosedate),
          estimatedCompletionDate: toIsoDate(opportunity.msp_estcompletiondate),
          consumedRecurring
        },
        points,
        kpis: {
          consumedRecurring,
          totalPlannedMonthlyUse: totalPlanned,
          latestPlannedMonthlyUse: points.length ? points[points.length - 1].plannedMonthlyUse : 0
        },
        renderHints: {
          view: 'timeseries',
          xField: 'month',
          yFields: ['plannedMonthlyUse'],
          currency: 'USD',
          defaultChart: 'line',
          showTable: true
        }
      });
    }
  );

  // ── view_staged_changes_diff ───────────────────────────────
  server.tool(
    'view_staged_changes_diff',
    'Build a render-friendly before/after diff table from staged write payloads.',
    {
      before: z.object({}).passthrough().describe('Current values object (before)'),
      after: z.object({}).passthrough().describe('Proposed values object (after)'),
      context: z.string().optional().describe('Optional context label (e.g. operation ID)')
    },
    async ({ before, after, context }) => {
      const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
      const rows = keys
        .map((field) => {
          const beforeValue = before?.[field] ?? null;
          const afterValue = after?.[field] ?? null;
          const beforeText = beforeValue === null ? null : String(beforeValue);
          const afterText = afterValue === null ? null : String(afterValue);

          if (beforeText === afterText) return null;

          let changeType = 'updated';
          if (beforeValue === null && afterValue !== null) changeType = 'added';
          if (beforeValue !== null && afterValue === null) changeType = 'removed';

          return {
            field,
            before: beforeValue,
            after: afterValue,
            changeType
          };
        })
        .filter(Boolean);

      return text({
        context: context || null,
        summary: {
          changedFieldCount: rows.length
        },
        rows,
        renderHints: {
          view: 'diffTable',
          columns: ['field', 'before', 'after', 'changeType'],
          emphasisField: 'changeType'
        }
      });
    }
  );

  // ── list_pending_operations ──────────────────────────────────
  server.tool(
    'list_pending_operations',
    'List all staged CRM write operations awaiting human approval.',
    {},
    async () => {
      const queue = getApprovalQueue();
      const pending = queue.listPending();
      return text({
        count: pending.length,
        operations: pending.map(op => ({
          id: op.id,
          type: op.type,
          description: op.description,
          stagedAt: op.stagedAt,
          expiresIn: Math.max(0, Math.round((op.expiresAt - Date.now()) / 1000)) + 's',
          before: op.beforeState,
          after: op.payload,
        })),
      });
    }
  );

  // ── execute_operation ──────────────────────────────────────
  server.tool(
    'execute_operation',
    'Approve and execute a single staged CRM write operation by ID.',
    {
      id: z.string().describe('Operation ID (e.g. "OP-1")')
    },
    async ({ id }) => {
      const queue = getApprovalQueue();
      const op = queue.approve(id);
      if (!op) return error(`Operation ${id} not found, already executed, or expired.`);

      // Pre-execution integrity check for milestone updates
      if (op.type === 'update_milestone' && op.identity?.milestoneNumber) {
        const recheck = await crmClient.request(op.entitySet, {
          query: { $select: 'msp_milestonenumber,msp_name,_msp_opportunityid_value' }
        });
        if (!recheck.ok) {
          queue.markFailed(id, 'Pre-execution verification failed: milestone no longer accessible');
          return error(`${id} aborted: milestone no longer accessible (${recheck.status}). The record may have been deleted.`);
        }
        const currentNumber = recheck.data?.msp_milestonenumber;
        if (currentNumber && currentNumber !== op.identity.milestoneNumber) {
          queue.markFailed(id, `Milestone number mismatch: expected ${op.identity.milestoneNumber}, got ${currentNumber}`);
          return error(
            `${id} aborted: milestone identity mismatch. ` +
            `Expected milestone number ${op.identity.milestoneNumber} but record at this GUID is ${currentNumber}. ` +
            `This may indicate the wrong milestone was targeted.`
          );
        }
      }

      // Execute against CRM
      let result;
      if (op.type === 'close_task') {
        // Try primary CloseTask action, fallback to bound Close
        result = await crmClient.request(op.entitySet, { method: op.method, body: op.payload });
        if (!result.ok && result.status !== 204 && op.fallbackEntitySet) {
          result = await crmClient.request(op.fallbackEntitySet, { method: 'POST', body: op.fallbackPayload });
        }
      } else {
        result = await crmClient.request(op.entitySet, { method: op.method, body: op.payload });
      }

      if (result.ok || result.status === 204) {
        queue.markExecuted(id, result.data);
        return text({ success: true, executed: id, type: op.type, description: op.description });
      }

      queue.markFailed(id, result.data?.message);
      return error(`Execution of ${id} failed (${result.status}): ${result.data?.message}`);
    }
  );

  // ── execute_all ────────────────────────────────────────────
  server.tool(
    'execute_all',
    'Approve and execute ALL pending staged operations in sequence.',
    {},
    async () => {
      const queue = getApprovalQueue();
      const pending = queue.listPending();
      if (!pending.length) return text({ executed: 0, message: 'No pending operations.' });

      const results = [];
      for (const op of pending) {
        const approved = queue.approve(op.id);
        if (!approved) {
          results.push({ id: op.id, success: false, reason: 'expired or missing' });
          continue;
        }

        // Pre-execution integrity check for milestone updates
        if (op.type === 'update_milestone' && op.identity?.milestoneNumber) {
          const recheck = await crmClient.request(op.entitySet, {
            query: { $select: 'msp_milestonenumber,msp_name,_msp_opportunityid_value' }
          });
          if (!recheck.ok) {
            queue.markFailed(op.id, 'Pre-execution verification failed: milestone no longer accessible');
            results.push({ id: op.id, success: false, reason: 'milestone no longer accessible' });
            continue;
          }
          const currentNumber = recheck.data?.msp_milestonenumber;
          if (currentNumber && currentNumber !== op.identity.milestoneNumber) {
            queue.markFailed(op.id, `Milestone number mismatch: expected ${op.identity.milestoneNumber}, got ${currentNumber}`);
            results.push({ id: op.id, success: false, reason: `identity mismatch: expected ${op.identity.milestoneNumber}, got ${currentNumber}` });
            continue;
          }
        }

        let result;
        if (op.type === 'close_task') {
          result = await crmClient.request(op.entitySet, { method: op.method, body: op.payload });
          if (!result.ok && result.status !== 204 && op.fallbackEntitySet) {
            result = await crmClient.request(op.fallbackEntitySet, { method: 'POST', body: op.fallbackPayload });
          }
        } else {
          result = await crmClient.request(op.entitySet, { method: op.method, body: op.payload });
        }

        if (result.ok || result.status === 204) {
          queue.markExecuted(op.id, result.data);
          results.push({ id: op.id, success: true });
        } else {
          queue.markFailed(op.id, result.data?.message);
          results.push({ id: op.id, success: false, reason: result.data?.message });
        }
      }

      const executed = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      return text({ executed, failed, results });
    }
  );

  // ── cancel_operation ───────────────────────────────────────
  server.tool(
    'cancel_operation',
    'Cancel/reject a single staged operation by ID. No CRM changes are made.',
    {
      id: z.string().describe('Operation ID (e.g. "OP-1")')
    },
    async ({ id }) => {
      const queue = getApprovalQueue();
      const op = queue.reject(id);
      if (!op) return error(`Operation ${id} not found or already processed.`);
      return text({ cancelled: id, type: op.type, description: op.description });
    }
  );

  // ── cancel_all ─────────────────────────────────────────────
  server.tool(
    'cancel_all',
    'Cancel/reject ALL pending staged operations. No CRM changes are made.',
    {},
    async () => {
      const queue = getApprovalQueue();
      const rejected = queue.rejectAll();
      return text({
        cancelled: rejected.length,
        operations: rejected.map(op => ({ id: op.id, type: op.type, description: op.description })),
      });
    }
  );

  // ── crm_auth_status ─────────────────────────────────────────
  server.tool(
    'crm_auth_status',
    'Check authentication status — shows current user, expiry, CRM URL.',
    {},
    async () => {
      const authResult = await crmClient.request('WhoAmI');
      if (!authResult.ok) return error(`Not authenticated: ${authResult.data?.message || authResult.status}`);
      return text({
        authenticated: true,
        userId: authResult.data?.UserId,
        businessUnitId: authResult.data?.BusinessUnitId,
        organizationId: authResult.data?.OrganizationId
      });
    }
  );
}
