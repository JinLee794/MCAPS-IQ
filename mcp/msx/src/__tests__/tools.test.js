import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from '../tools.js';
import { resetApprovalQueue, getApprovalQueue } from '../approval-queue.js';

// Build a mock CRM client that records calls and returns configurable responses
function mockCrmClient(responses = {}) {
  return {
    request: vi.fn(async (path, opts) => {
      if (responses[path]) return responses[path];
      // Default: success with empty data
      return { ok: true, status: 200, data: {} };
    }),
    requestAllPages: vi.fn(async (path, opts) => {
      if (responses[path]) return responses[path];
      return { ok: true, status: 200, data: { value: [] } };
    }),
    buildUrl: vi.fn()
  };
}

// Helper: call a registered tool by invoking the server's tool handler
async function callTool(server, name, args = {}) {
  const tool = server._registeredTools?.[name];
  if (!tool) throw new Error(`Tool "${name}" not registered`);
  return tool.handler(args);
}

describe('registerTools', () => {
  let server;
  let crm;

  beforeEach(() => {
    resetApprovalQueue();
    server = new McpServer({ name: 'test', version: '0.0.1' });
    crm = mockCrmClient({
      WhoAmI: { ok: true, status: 200, data: { UserId: 'abc-123', BusinessUnitId: 'bu-1' } }
    });
    registerTools(server, crm);
  });

  it('registers all expected tools', () => {
    const toolNames = Object.keys(server._registeredTools);
    expect(toolNames).toContain('crm_whoami');
    expect(toolNames).toContain('crm_query');
    expect(toolNames).toContain('crm_get_record');
    expect(toolNames).toContain('list_opportunities');
    expect(toolNames).toContain('get_my_active_opportunities');
    expect(toolNames).toContain('get_milestones');
    expect(toolNames).toContain('create_milestone');
    expect(toolNames).toContain('create_task');
    expect(toolNames).toContain('update_task');
    expect(toolNames).toContain('close_task');
    expect(toolNames).toContain('update_milestone');
    expect(toolNames).toContain('list_accounts_by_tpid');
    expect(toolNames).toContain('get_task_status_options');
    expect(toolNames).toContain('get_milestone_activities');
    expect(toolNames).toContain('find_milestones_needing_tasks');
    expect(toolNames).toContain('crm_auth_status');
    expect(toolNames).toContain('view_milestone_timeline');
    expect(toolNames).toContain('view_opportunity_cost_trend');
    expect(toolNames).toContain('view_staged_changes_diff');
    expect(toolNames).toContain('list_pending_operations');
    expect(toolNames).toContain('execute_operation');
    expect(toolNames).toContain('execute_all');
    expect(toolNames).toContain('cancel_operation');
    expect(toolNames).toContain('cancel_all');
  });

  describe('crm_whoami', () => {
    it('returns user data on success', async () => {
      const result = await callTool(server, 'crm_whoami');
      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      expect(text).toContain('abc-123');
    });

    it('returns error when CRM is unreachable', async () => {
      crm.request.mockResolvedValueOnce({ ok: false, status: 500, data: { message: 'Server error' } });
      const result = await callTool(server, 'crm_whoami');
      expect(result.isError).toBe(true);
    });
  });

  describe('crm_query', () => {
    it('requires entitySet', async () => {
      const result = await callTool(server, 'crm_query', {});
      expect(result.isError).toBe(true);
    });

    it('passes query params to requestAllPages', async () => {
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [{ name: 'Test' }] }
      });
      const result = await callTool(server, 'crm_query', {
        entitySet: 'accounts',
        filter: "name eq 'Test'",
        select: 'name,accountid',
        top: 5
      });
      expect(result.isError).toBeUndefined();
      expect(crm.requestAllPages).toHaveBeenCalledWith('accounts', {
        query: expect.objectContaining({
          $filter: "name eq 'Test'",
          $select: 'name,accountid',
          $top: '5'
        })
      });
    });
  });

  describe('crm_get_record', () => {
    it('rejects invalid GUID', async () => {
      const result = await callTool(server, 'crm_get_record', {
        entitySet: 'accounts',
        id: 'not-a-guid'
      });
      expect(result.isError).toBe(true);
    });

    it('fetches a single record', async () => {
      crm.request.mockResolvedValueOnce({
        ok: true, status: 200, data: { accountid: '12345678-1234-1234-1234-123456789abc', name: 'Contoso' }
      });
      const result = await callTool(server, 'crm_get_record', {
        entitySet: 'accounts',
        id: '12345678-1234-1234-1234-123456789abc'
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Contoso');
    });
  });

  describe('list_opportunities', () => {
    it('rejects when neither accountIds nor customerKeyword provided', async () => {
      const result = await callTool(server, 'list_opportunities', {});
      expect(result.isError).toBe(true);
    });

    it('loads opportunities for valid account IDs', async () => {
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [{ opportunityid: 'opp-1', name: 'Deal A' }] }
      });
      const result = await callTool(server, 'list_opportunities', {
        accountIds: ['12345678-1234-1234-1234-123456789abc']
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
    });

    it('resolves accounts from customerKeyword and returns opportunities', async () => {
      // First call: account search by keyword
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [
          { accountid: '11111111-1111-1111-1111-111111111111', name: 'Contoso Corp' }
        ] }
      });
      // Second call: opportunities for resolved account
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [
          { opportunityid: 'opp-1', name: 'Contoso Azure Migration' }
        ] }
      });
      const result = await callTool(server, 'list_opportunities', { customerKeyword: 'Contoso' });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
      expect(parsed.opportunities[0].name).toBe('Contoso Azure Migration');
      // Verify account search was called with contains filter
      expect(crm.requestAllPages).toHaveBeenCalledWith('accounts', expect.objectContaining({
        query: expect.objectContaining({ $filter: expect.stringContaining('contains(name') })
      }));
    });

    it('returns empty when customerKeyword matches no accounts', async () => {
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [] }
      });
      const result = await callTool(server, 'list_opportunities', { customerKeyword: 'NonexistentCorp' });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(0);
      expect(parsed.message).toContain('NonexistentCorp');
    });
  });

  describe('get_milestones', () => {
    it('defaults to current user milestones when no filter is provided', async () => {
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [{ msp_milestonenumber: '7-100000001' }] }
      });
      const result = await callTool(server, 'get_milestones', {});
      expect(result.isError).toBeUndefined();
      expect(crm.request).toHaveBeenCalledWith('WhoAmI');
      expect(crm.requestAllPages).toHaveBeenCalledWith(
        'msp_engagementmilestones',
        {
          query: expect.objectContaining({
            $filter: "_ownerid_value eq 'abc-123'"
          })
        }
      );
    });

    it('returns an error if mine is disabled and no identifiers are provided', async () => {
      const result = await callTool(server, 'get_milestones', { mine: false });
      expect(result.isError).toBe(true);
    });

    it('searches by milestone number', async () => {
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [{ msp_milestonenumber: '7-123456789' }] }
      });
      const result = await callTool(server, 'get_milestones', { milestoneNumber: '7-123456789' });
      expect(result.isError).toBeUndefined();
    });

    it('supports ownerId filter', async () => {
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [{ msp_milestonenumber: '7-123456780' }] }
      });
      const result = await callTool(server, 'get_milestones', {
        ownerId: '12345678-1234-1234-1234-123456789abc'
      });
      expect(result.isError).toBeUndefined();
      expect(crm.requestAllPages).toHaveBeenCalledWith(
        'msp_engagementmilestones',
        {
          query: expect.objectContaining({
            $filter: "_ownerid_value eq '12345678-1234-1234-1234-123456789abc'"
          })
        }
      );
    });
  });

  describe('get_my_active_opportunities', () => {
    it('returns owned and deal-team opportunities for current user', async () => {
      // First call: owned opportunities
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [
          { opportunityid: 'opp-1', name: 'Contoso AI Platform', estimatedclosedate: '2026-12-31',
            _parentaccountid_value: 'acct-1',
            '_parentaccountid_value@OData.Community.Display.V1.FormattedValue': 'Contoso Ltd' }
        ] }
      });
      // Second call: milestones owned by user (deal team discovery)
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [
          { _msp_opportunityid_value: 'opp-1' },  // already owned — should be deduped
          { _msp_opportunityid_value: 'opp-2' }   // deal-team only
        ] }
      });
      // Third call: fetch deal-team opportunities
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [
          { opportunityid: 'opp-2', name: 'Fabrikam Cloud', estimatedclosedate: '2026-09-30',
            _parentaccountid_value: 'acct-2',
            '_parentaccountid_value@OData.Community.Display.V1.FormattedValue': 'Fabrikam Inc' }
        ] }
      });
      const result = await callTool(server, 'get_my_active_opportunities', {});
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(2);
      expect(parsed.opportunities[0].customer).toBe('Contoso Ltd');
      expect(parsed.opportunities[0].relationship).toBe('owner');
      expect(parsed.opportunities[1].name).toBe('Fabrikam Cloud');
      expect(parsed.opportunities[1].relationship).toBe('deal-team');
    });

    it('filters by customerKeyword across owned and deal-team', async () => {
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [
          { opportunityid: 'opp-1', name: 'Contoso AI', _parentaccountid_value: 'acct-1',
            '_parentaccountid_value@OData.Community.Display.V1.FormattedValue': 'Contoso Ltd' },
          { opportunityid: 'opp-2', name: 'Fabrikam Cloud', _parentaccountid_value: 'acct-2',
            '_parentaccountid_value@OData.Community.Display.V1.FormattedValue': 'Fabrikam Inc' }
        ] }
      });
      // Milestones: no additional deal-team opps
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [] }
      });
      const result = await callTool(server, 'get_my_active_opportunities', { customerKeyword: 'contoso' });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
      expect(parsed.opportunities[0].name).toBe('Contoso AI');
    });

    it('returns error when WhoAmI fails', async () => {
      crm.request.mockResolvedValueOnce({ ok: false, status: 401, data: { message: 'Unauthorized' } });
      const result = await callTool(server, 'get_my_active_opportunities', {});
      expect(result.isError).toBe(true);
    });

    it('returns only owned opps when milestone query fails gracefully', async () => {
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [
          { opportunityid: 'opp-1', name: 'Contoso AI', _parentaccountid_value: 'acct-1',
            '_parentaccountid_value@OData.Community.Display.V1.FormattedValue': 'Contoso Ltd' }
        ] }
      });
      // Milestone query fails
      crm.requestAllPages.mockResolvedValueOnce({ ok: false, status: 500, data: { message: 'Server error' } });
      const result = await callTool(server, 'get_my_active_opportunities', {});
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
      expect(parsed.opportunities[0].relationship).toBe('owner');
    });
  });

  describe('get_milestones (enhanced)', () => {
    const makeMilestone = (name, status, oppName, wlName) => ({
      msp_engagementmilestoneid: 'ms-1',
      msp_milestonenumber: '7-100',
      msp_name: name,
      msp_milestonedate: '2026-06-01',
      msp_monthlyuse: 1000,
      'msp_milestonestatus@OData.Community.Display.V1.FormattedValue': status,
      '_msp_opportunityid_value@OData.Community.Display.V1.FormattedValue': oppName,
      '_msp_workloadlkid_value@OData.Community.Display.V1.FormattedValue': wlName,
      'msp_milestonecategory@OData.Community.Display.V1.FormattedValue': 'PoC/Pilot'
    });

    it('statusFilter=active excludes Completed milestones', async () => {
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [
          makeMilestone('MS-A', 'In Progress', 'Opp1', 'Azure'),
          makeMilestone('MS-B', 'Completed', 'Opp1', 'Azure'),
          makeMilestone('MS-C', 'Not Started', 'Opp2', 'M365')
        ] }
      });
      const result = await callTool(server, 'get_milestones', { statusFilter: 'active' });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(2);
    });

    it('keyword filters across milestone name, opportunity, and workload', async () => {
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [
          makeMilestone('Deploy Copilot', 'In Progress', 'Contoso AI', 'Azure OpenAI'),
          makeMilestone('Network Setup', 'In Progress', 'Fabrikam Cloud', 'Azure Networking')
        ] }
      });
      const result = await callTool(server, 'get_milestones', { keyword: 'contoso' });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
      expect(parsed.milestones[0].msp_name).toBe('Deploy Copilot');
    });

    it('format=summary returns grouped compact output', async () => {
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [
          makeMilestone('MS-A', 'In Progress', 'Opp1', 'Azure'),
          makeMilestone('MS-B', 'Not Started', 'Opp1', 'M365')
        ] }
      });
      const result = await callTool(server, 'get_milestones', { format: 'summary' });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.byStatus).toBeDefined();
      expect(parsed.byStatus['In Progress']).toBe(1);
      expect(parsed.byStatus['Not Started']).toBe(1);
      expect(parsed.byOpportunity).toBeDefined();
      expect(parsed.milestones[0]).toHaveProperty('status');
      expect(parsed.milestones[0]).toHaveProperty('opportunity');
    });

    it('combines statusFilter and keyword', async () => {
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [
          makeMilestone('Deploy Copilot', 'Completed', 'Contoso AI', 'Azure'),
          makeMilestone('Copilot Pilot', 'In Progress', 'Contoso AI', 'Azure'),
          makeMilestone('Network Setup', 'In Progress', 'Fabrikam', 'Azure')
        ] }
      });
      const result = await callTool(server, 'get_milestones', { statusFilter: 'active', keyword: 'contoso' });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
      expect(parsed.milestones[0].msp_name).toBe('Copilot Pilot');
    });

    it('supports batch opportunityIds array', async () => {
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [
          makeMilestone('MS-A', 'In Progress', 'Opp1', 'Azure'),
          makeMilestone('MS-B', 'Not Started', 'Opp2', 'M365')
        ] }
      });
      const result = await callTool(server, 'get_milestones', {
        opportunityIds: [
          '11111111-1111-1111-1111-111111111111',
          '22222222-2222-2222-2222-222222222222'
        ]
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(2);
      // Verify the filter used OR clauses for both IDs
      expect(crm.requestAllPages).toHaveBeenCalledWith(
        'msp_engagementmilestones',
        expect.objectContaining({
          query: expect.objectContaining({
            $filter: expect.stringContaining("_msp_opportunityid_value eq '11111111-1111-1111-1111-111111111111'")
          })
        })
      );
    });

    it('rejects opportunityIds with no valid GUIDs', async () => {
      const result = await callTool(server, 'get_milestones', { opportunityIds: ['bad-id'] });
      expect(result.isError).toBe(true);
    });

    it('taskFilter=without-tasks returns only milestones without linked tasks', async () => {
      const ms1 = { ...makeMilestone('MS-A', 'In Progress', 'Opp1', 'Azure'), msp_engagementmilestoneid: '11111111-1111-1111-1111-111111111111' };
      const ms2 = { ...makeMilestone('MS-B', 'In Progress', 'Opp1', 'Azure'), msp_engagementmilestoneid: '22222222-2222-2222-2222-222222222222' };
      // Milestone query
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [ms1, ms2] }
      });
      // Task query — only ms1 has tasks
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [
          { _regardingobjectid_value: '11111111-1111-1111-1111-111111111111' }
        ] }
      });
      const result = await callTool(server, 'get_milestones', { taskFilter: 'without-tasks' });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
      expect(parsed.milestones[0].msp_engagementmilestoneid).toBe('22222222-2222-2222-2222-222222222222');
    });

    it('taskFilter=with-tasks returns only milestones with linked tasks', async () => {
      const ms1 = { ...makeMilestone('MS-A', 'In Progress', 'Opp1', 'Azure'), msp_engagementmilestoneid: '11111111-1111-1111-1111-111111111111' };
      const ms2 = { ...makeMilestone('MS-B', 'In Progress', 'Opp1', 'Azure'), msp_engagementmilestoneid: '22222222-2222-2222-2222-222222222222' };
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [ms1, ms2] }
      });
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [
          { _regardingobjectid_value: '11111111-1111-1111-1111-111111111111' }
        ] }
      });
      const result = await callTool(server, 'get_milestones', { taskFilter: 'with-tasks' });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
      expect(parsed.milestones[0].msp_engagementmilestoneid).toBe('11111111-1111-1111-1111-111111111111');
    });
  });

  describe('get_milestone_activities (batch)', () => {
    it('supports batch milestoneIds array', async () => {
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [
          { activityid: 'task-1', subject: 'Task A', _regardingobjectid_value: '11111111-1111-1111-1111-111111111111' },
          { activityid: 'task-2', subject: 'Task B', _regardingobjectid_value: '22222222-2222-2222-2222-222222222222' }
        ] }
      });
      const result = await callTool(server, 'get_milestone_activities', {
        milestoneIds: [
          '11111111-1111-1111-1111-111111111111',
          '22222222-2222-2222-2222-222222222222'
        ]
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(2);
      expect(parsed.byMilestone).toBeDefined();
      expect(parsed.byMilestone['11111111-1111-1111-1111-111111111111']).toHaveLength(1);
      expect(parsed.byMilestone['22222222-2222-2222-2222-222222222222']).toHaveLength(1);
    });

    it('single milestoneId still returns flat tasks array', async () => {
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [
          { activityid: 'task-1', subject: 'Task A' }
        ] }
      });
      const result = await callTool(server, 'get_milestone_activities', {
        milestoneId: '11111111-1111-1111-1111-111111111111'
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tasks).toBeDefined();
      expect(parsed.byMilestone).toBeUndefined();
    });

    it('rejects when neither milestoneId nor milestoneIds provided', async () => {
      const result = await callTool(server, 'get_milestone_activities', {});
      expect(result.isError).toBe(true);
    });
  });

  describe('find_milestones_needing_tasks', () => {
    it('resolves customers → opps → milestones and returns those without tasks', async () => {
      // 1. Account search for "Contoso"
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [
          { accountid: 'acct-1', name: 'Contoso Corp' }
        ] }
      });
      // 2. Opportunities for that account
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [
          { opportunityid: 'opp-1', name: 'Contoso Azure AI' }
        ] }
      });
      // 3. Milestones for the opportunity
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [
          {
            msp_engagementmilestoneid: 'ms-1',
            msp_milestonenumber: '7-100',
            msp_name: 'Kickoff',
            msp_milestonedate: '2026-06-01',
            _msp_opportunityid_value: 'opp-1',
            'msp_milestonestatus@OData.Community.Display.V1.FormattedValue': 'In Progress',
            '_msp_workloadlkid_value@OData.Community.Display.V1.FormattedValue': 'Azure'
          },
          {
            msp_engagementmilestoneid: 'ms-2',
            msp_milestonenumber: '7-101',
            msp_name: 'PoC',
            msp_milestonedate: '2026-07-01',
            _msp_opportunityid_value: 'opp-1',
            'msp_milestonestatus@OData.Community.Display.V1.FormattedValue': 'Not Started',
            '_msp_workloadlkid_value@OData.Community.Display.V1.FormattedValue': 'Azure'
          }
        ] }
      });
      // 4. Task check — ms-1 has a task, ms-2 does not
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [
          { _regardingobjectid_value: 'ms-1' }
        ] }
      });

      const result = await callTool(server, 'find_milestones_needing_tasks', {
        customerKeywords: ['Contoso']
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.totalMilestonesNeedingTasks).toBe(1);
      expect(parsed.customers[0].customer).toBe('Contoso');
      expect(parsed.customers[0].milestonesNeedingTasks).toBe(1);
      expect(parsed.customers[0].milestones[0].name).toBe('PoC');
    });

    it('handles customer with no matching accounts', async () => {
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [] }
      });
      const result = await callTool(server, 'find_milestones_needing_tasks', {
        customerKeywords: ['NonexistentCorp']
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.totalMilestonesNeedingTasks).toBe(0);
      expect(parsed.customers[0].error).toBe('No matching accounts found');
    });

    it('rejects empty customerKeywords', async () => {
      const result = await callTool(server, 'find_milestones_needing_tasks', { customerKeywords: [] });
      expect(result.isError).toBe(true);
    });
  });

  describe('create_task', () => {
    it('validates milestoneId', async () => {
      const result = await callTool(server, 'create_task', { milestoneId: 'bad', subject: 'Test' });
      expect(result.isError).toBe(true);
    });

    it('requires subject', async () => {
      const result = await callTool(server, 'create_task', {
        milestoneId: '12345678-1234-1234-1234-123456789abc'
      });
      expect(result.isError).toBe(true);
    });

    it('creates a task with valid params (stages operation)', async () => {
      const result = await callTool(server, 'create_task', {
        milestoneId: '12345678-1234-1234-1234-123456789abc',
        subject: 'Architecture Design Session',
        category: 861980004
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.staged).toBe(true);
      expect(parsed.operationId).toMatch(/^OP-/);
      expect(parsed.payload.subject).toBe('Architecture Design Session');
      expect(parsed.payload.msp_taskcategory).toBe(861980004);
    });
  });

  describe('create_milestone', () => {
    it('validates opportunityId', async () => {
      const result = await callTool(server, 'create_milestone', {
        opportunityId: 'bad',
        name: 'Test Milestone'
      });
      expect(result.isError).toBe(true);
    });

    it('requires name', async () => {
      const result = await callTool(server, 'create_milestone', {
        opportunityId: '12345678-1234-1234-1234-123456789abc'
      });
      expect(result.isError).toBe(true);
    });

    it('stages create operation with expected bindings and fields', async () => {
      crm.request.mockImplementation(async (path) => {
        if (path.startsWith('opportunities(')) {
          return { ok: true, status: 200, data: { name: 'FY26 - Elevance | Benefits AI | Associate | #AIDesignWinHLS' } };
        }
        return { ok: true, status: 200, data: {} };
      });

      const result = await callTool(server, 'create_milestone', {
        opportunityId: '12345678-1234-1234-1234-123456789abc',
        name: 'FY25 - Benefits - AI App Service Performance Tuning',
        milestoneDate: '2026-03-27',
        monthlyUse: 1500,
        milestoneStatus: 861980000,
        ownerId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
      });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.staged).toBe(true);
      expect(parsed.operationId).toMatch(/^OP-/);
      expect(parsed.payload.msp_name).toBe('FY25 - Benefits - AI App Service Performance Tuning');
      expect(parsed.payload['msp_OpportunityId@odata.bind']).toBe('/opportunities(12345678-1234-1234-1234-123456789abc)');
      expect(parsed.payload.msp_milestonedate).toBe('2026-03-27');
      expect(parsed.payload.msp_monthlyuse).toBe(1500);
      expect(parsed.payload.msp_milestonestatus).toBe(861980000);
      expect(parsed.payload['ownerid@odata.bind']).toBe('/systemusers(aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee)');
      expect(parsed.description).toContain('Benefits AI');
    });
  });

  describe('update_task', () => {
    it('rejects empty update', async () => {
      const result = await callTool(server, 'update_task', {
        taskId: '12345678-1234-1234-1234-123456789abc'
      });
      expect(result.isError).toBe(true);
    });

    it('stages update with before-state', async () => {
      crm.request.mockResolvedValueOnce({
        ok: true, status: 200, data: { subject: 'Old Subject' }
      });
      const result = await callTool(server, 'update_task', {
        taskId: '12345678-1234-1234-1234-123456789abc',
        subject: 'New Subject'
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.staged).toBe(true);
      expect(parsed.before.subject).toBe('Old Subject');
      expect(parsed.after.subject).toBe('New Subject');
    });
  });

  describe('close_task', () => {
    it('requires statusCode', async () => {
      const result = await callTool(server, 'close_task', {
        taskId: '12345678-1234-1234-1234-123456789abc'
      });
      expect(result.isError).toBe(true);
    });

    it('stages close operation', async () => {
      crm.request.mockResolvedValueOnce({
        ok: true, status: 200, data: { subject: 'My Task', statuscode: 2 }
      });
      const result = await callTool(server, 'close_task', {
        taskId: '12345678-1234-1234-1234-123456789abc',
        statusCode: 5
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.staged).toBe(true);
      expect(parsed.statusCode).toBe(5);
    });
  });

  describe('update_milestone', () => {
    const MILESTONE_GUID = '12345678-1234-1234-1234-123456789abc';
    const OPP_GUID = 'aaaa1111-2222-3333-4444-555566667777';

    const makeMilestoneRecord = (overrides = {}) => ({
      msp_engagementmilestoneid: MILESTONE_GUID,
      msp_milestonenumber: '7-100000001',
      msp_name: 'Kickoff Meeting',
      _msp_opportunityid_value: OPP_GUID,
      '_msp_opportunityid_value@OData.Community.Display.V1.FormattedValue': 'Contoso AI Platform',
      _ownerid_value: 'abc-123', // matches WhoAmI
      msp_milestonedate: '2026-03-01',
      msp_monthlyuse: 500,
      msp_forecastcomments: 'On track',
      ...overrides
    });

    it('rejects invalid milestoneId GUID', async () => {
      const result = await callTool(server, 'update_milestone', {
        milestoneId: 'not-a-guid',
        milestoneDate: '2026-04-15'
      });
      expect(result.isError).toBe(true);
    });

    it('rejects empty update (no fields)', async () => {
      const result = await callTool(server, 'update_milestone', {
        milestoneId: MILESTONE_GUID
      });
      expect(result.isError).toBe(true);
    });

    it('returns error when milestone is not found', async () => {
      crm.request.mockImplementation(async (path) => {
        if (path === 'WhoAmI') return { ok: true, status: 200, data: { UserId: 'abc-123' } };
        if (path.startsWith('msp_engagementmilestones(')) return { ok: false, status: 404, data: { message: 'Not Found' } };
        return { ok: true, status: 200, data: {} };
      });
      const result = await callTool(server, 'update_milestone', {
        milestoneId: MILESTONE_GUID,
        milestoneDate: '2026-04-15'
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found or inaccessible');
    });

    it('stages update with identity metadata when user owns milestone', async () => {
      crm.request.mockImplementation(async (path) => {
        if (path === 'WhoAmI') return { ok: true, status: 200, data: { UserId: 'abc-123' } };
        if (path.startsWith('msp_engagementmilestones(')) return { ok: true, status: 200, data: makeMilestoneRecord() };
        return { ok: true, status: 200, data: {} };
      });

      const result = await callTool(server, 'update_milestone', {
        milestoneId: MILESTONE_GUID,
        milestoneDate: '2026-04-15'
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.staged).toBe(true);
      expect(parsed.identity.milestoneNumber).toBe('7-100000001');
      expect(parsed.identity.milestoneName).toBe('Kickoff Meeting');
      expect(parsed.identity.opportunityName).toBe('Contoso AI Platform');
      expect(parsed.description).toContain('7-100000001');
      expect(parsed.description).toContain('Contoso AI Platform');
      expect(parsed.before.msp_milestonedate).toBe('2026-03-01');
      expect(parsed.after.msp_milestonedate).toBe('2026-04-15');
    });

    it('allows update when user is on the deal team (owns other milestones under same opp)', async () => {
      crm.request.mockImplementation(async (path) => {
        if (path === 'WhoAmI') return { ok: true, status: 200, data: { UserId: 'abc-123' } };
        if (path.startsWith('msp_engagementmilestones(')) {
          return { ok: true, status: 200, data: makeMilestoneRecord({ _ownerid_value: 'other-user-id' }) };
        }
        if (path.startsWith('opportunities(')) {
          return { ok: true, status: 200, data: { _ownerid_value: 'other-user-id' } };
        }
        return { ok: true, status: 200, data: {} };
      });
      crm.requestAllPages.mockImplementation(async (entity) => {
        if (entity === 'msp_engagementmilestones') {
          return { ok: true, status: 200, data: { value: [{ msp_engagementmilestoneid: 'other-ms' }] } };
        }
        return { ok: true, status: 200, data: { value: [] } };
      });

      const result = await callTool(server, 'update_milestone', {
        milestoneId: MILESTONE_GUID,
        monthlyUse: 1000
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.staged).toBe(true);
    });

    it('rejects update when user is not owner and not on deal team', async () => {
      crm.request.mockImplementation(async (path) => {
        if (path === 'WhoAmI') return { ok: true, status: 200, data: { UserId: 'abc-123' } };
        if (path.startsWith('msp_engagementmilestones(')) {
          return { ok: true, status: 200, data: makeMilestoneRecord({ _ownerid_value: 'other-user-id' }) };
        }
        if (path.startsWith('opportunities(')) {
          return { ok: true, status: 200, data: { _ownerid_value: 'other-user-id' } };
        }
        return { ok: true, status: 200, data: {} };
      });
      crm.requestAllPages.mockImplementation(async () => {
        return { ok: true, status: 200, data: { value: [] } };
      });

      const result = await callTool(server, 'update_milestone', {
        milestoneId: MILESTONE_GUID,
        milestoneDate: '2026-04-15'
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Ownership check failed');
      expect(result.content[0].text).toContain('not on the deal team');
    });

    it('rejects update when milestone has no opportunity and user is not owner', async () => {
      crm.request.mockImplementation(async (path) => {
        if (path === 'WhoAmI') return { ok: true, status: 200, data: { UserId: 'abc-123' } };
        if (path.startsWith('msp_engagementmilestones(')) {
          return { ok: true, status: 200, data: makeMilestoneRecord({
            _ownerid_value: 'other-user-id',
            _msp_opportunityid_value: null
          }) };
        }
        return { ok: true, status: 200, data: {} };
      });

      const result = await callTool(server, 'update_milestone', {
        milestoneId: MILESTONE_GUID,
        monthlyUse: 999
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('no linked opportunity');
    });

    it('allows update when user owns the parent opportunity', async () => {
      crm.request.mockImplementation(async (path) => {
        if (path === 'WhoAmI') return { ok: true, status: 200, data: { UserId: 'abc-123' } };
        if (path.startsWith('msp_engagementmilestones(')) {
          return { ok: true, status: 200, data: makeMilestoneRecord({ _ownerid_value: 'other-user-id' }) };
        }
        if (path.startsWith('opportunities(')) {
          return { ok: true, status: 200, data: { _ownerid_value: 'abc-123' } };
        }
        return { ok: true, status: 200, data: {} };
      });

      const result = await callTool(server, 'update_milestone', {
        milestoneId: MILESTONE_GUID,
        forecastComments: 'Updated forecast'
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.staged).toBe(true);
    });
  });

  describe('update_milestone execution integrity', () => {
    const MILESTONE_GUID = '12345678-1234-1234-1234-123456789abc';
    const OPP_GUID = 'aaaa1111-2222-3333-4444-555566667777';

    // Suppress 'error' events from ApprovalQueue (EventEmitter throws unhandled)
    beforeEach(() => {
      getApprovalQueue().on('error', () => {});
    });

    it('execute_operation blocks when milestone number does not match staged identity', async () => {
      // Stage an update with identity
      crm.request.mockImplementation(async (path) => {
        if (path === 'WhoAmI') return { ok: true, status: 200, data: { UserId: 'abc-123' } };
        if (path.startsWith('msp_engagementmilestones(')) {
          return { ok: true, status: 200, data: {
            msp_engagementmilestoneid: MILESTONE_GUID,
            msp_milestonenumber: '7-100000001',
            msp_name: 'Kickoff',
            _msp_opportunityid_value: OPP_GUID,
            _ownerid_value: 'abc-123',
            msp_milestonedate: '2026-03-01'
          } };
        }
        return { ok: true, status: 200, data: {} };
      });

      await callTool(server, 'update_milestone', {
        milestoneId: MILESTONE_GUID,
        milestoneDate: '2026-04-15'
      });

      // Now at execution time, the record returns a different milestone number
      crm.request.mockImplementation(async (path, opts) => {
        if (path.startsWith('msp_engagementmilestones(') && !opts?.method) {
          return { ok: true, status: 200, data: {
            msp_milestonenumber: '7-DIFFERENT',
            msp_name: 'Wrong Milestone',
            _msp_opportunityid_value: 'other-opp'
          } };
        }
        return { ok: true, status: 200, data: {} };
      });

      const result = await callTool(server, 'execute_operation', { id: 'OP-1' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('identity mismatch');
      expect(result.content[0].text).toContain('7-100000001');
    });

    it('execute_operation proceeds when milestone number matches', async () => {
      crm.request.mockImplementation(async (path) => {
        if (path === 'WhoAmI') return { ok: true, status: 200, data: { UserId: 'abc-123' } };
        if (path.startsWith('msp_engagementmilestones(')) {
          return { ok: true, status: 200, data: {
            msp_engagementmilestoneid: MILESTONE_GUID,
            msp_milestonenumber: '7-100000001',
            msp_name: 'Kickoff',
            _msp_opportunityid_value: OPP_GUID,
            _ownerid_value: 'abc-123',
            msp_milestonedate: '2026-03-01'
          } };
        }
        return { ok: true, status: 200, data: {} };
      });

      await callTool(server, 'update_milestone', {
        milestoneId: MILESTONE_GUID,
        milestoneDate: '2026-04-15'
      });

      // Execution-time re-check returns matching number, then PATCH succeeds
      crm.request.mockImplementation(async (path, opts) => {
        if (path.startsWith('msp_engagementmilestones(') && !opts?.method) {
          return { ok: true, status: 200, data: { msp_milestonenumber: '7-100000001' } };
        }
        if (opts?.method === 'PATCH') {
          return { ok: true, status: 204, data: null };
        }
        return { ok: true, status: 200, data: {} };
      });

      const result = await callTool(server, 'execute_operation', { id: 'OP-1' });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('execute_operation aborts when milestone is no longer accessible', async () => {
      crm.request.mockImplementation(async (path) => {
        if (path === 'WhoAmI') return { ok: true, status: 200, data: { UserId: 'abc-123' } };
        if (path.startsWith('msp_engagementmilestones(')) {
          return { ok: true, status: 200, data: {
            msp_engagementmilestoneid: MILESTONE_GUID,
            msp_milestonenumber: '7-100000001',
            msp_name: 'Kickoff',
            _msp_opportunityid_value: OPP_GUID,
            _ownerid_value: 'abc-123',
            msp_milestonedate: '2026-03-01'
          } };
        }
        return { ok: true, status: 200, data: {} };
      });

      await callTool(server, 'update_milestone', {
        milestoneId: MILESTONE_GUID,
        milestoneDate: '2026-04-15'
      });

      // At execution time, record is gone
      crm.request.mockImplementation(async (path, opts) => {
        if (path.startsWith('msp_engagementmilestones(') && !opts?.method) {
          return { ok: false, status: 404, data: { message: 'Not Found' } };
        }
        return { ok: true, status: 200, data: {} };
      });

      const result = await callTool(server, 'execute_operation', { id: 'OP-1' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('no longer accessible');
    });
  });

  describe('list_accounts_by_tpid', () => {
    it('rejects non-numeric TPIDs', async () => {
      const result = await callTool(server, 'list_accounts_by_tpid', { tpids: ['abc'] });
      expect(result.isError).toBe(true);
    });

    it('looks up accounts by valid TPID', async () => {
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true, status: 200, data: { value: [{ accountid: 'a-1', name: 'Contoso' }] }
      });
      const result = await callTool(server, 'list_accounts_by_tpid', { tpids: ['12345'] });
      expect(result.isError).toBeUndefined();
    });
  });

  describe('view_milestone_timeline', () => {
    it('requires ownerId or opportunityId', async () => {
      const result = await callTool(server, 'view_milestone_timeline', {});
      expect(result.isError).toBe(true);
    });

    it('returns timeline events with render hints', async () => {
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          value: [{
            msp_engagementmilestoneid: '11111111-1111-1111-1111-111111111111',
            msp_name: 'Kickoff',
            msp_milestonenumber: '7-100000001',
            msp_milestonedate: '2026-03-01',
            msp_milestonestatus: 1,
            _msp_opportunityid_value: '22222222-2222-2222-2222-222222222222'
          }]
        }
      });
      crm.request.mockResolvedValueOnce({ ok: true, status: 200, data: { name: 'Deal A' } });

      const result = await callTool(server, 'view_milestone_timeline', {
        ownerId: '12345678-1234-1234-1234-123456789abc'
      });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
      expect(parsed.renderHints.view).toBe('timeline');
    });
  });

  describe('view_opportunity_cost_trend', () => {
    it('requires valid opportunityId', async () => {
      const result = await callTool(server, 'view_opportunity_cost_trend', { opportunityId: 'bad-id' });
      expect(result.isError).toBe(true);
    });

    it('returns points and KPI values', async () => {
      crm.request.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          opportunityid: '12345678-1234-1234-1234-123456789abc',
          name: 'Deal A',
          msp_consumptionconsumedrecurring: 500
        }
      });
      crm.requestAllPages.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          value: [
            { msp_milestonedate: '2026-03-01', msp_monthlyuse: 100 },
            { msp_milestonedate: '2026-03-15', msp_monthlyuse: 200 },
            { msp_milestonedate: '2026-04-01', msp_monthlyuse: 300 }
          ]
        }
      });

      const result = await callTool(server, 'view_opportunity_cost_trend', {
        opportunityId: '12345678-1234-1234-1234-123456789abc'
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.points.length).toBe(2);
      expect(parsed.kpis.totalPlannedMonthlyUse).toBe(600);
      expect(parsed.renderHints.view).toBe('timeseries');
    });
  });

  describe('view_staged_changes_diff', () => {
    it('returns changed fields in diff rows', async () => {
      const result = await callTool(server, 'view_staged_changes_diff', {
        before: { subject: 'Old', due: '2026-03-10', unchanged: 'x' },
        after: { subject: 'New', due: null, unchanged: 'x', owner: 'me' },
        context: 'OP-1'
      });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.context).toBe('OP-1');
      expect(parsed.summary.changedFieldCount).toBe(3);
      expect(parsed.renderHints.view).toBe('diffTable');
    });
  });

  describe('approval queue tools', () => {
    it('list_pending_operations returns empty when queue is clean', async () => {
      const result = await callTool(server, 'list_pending_operations', {});
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(0);
      expect(parsed.operations).toHaveLength(0);
    });

    it('list_pending_operations shows staged writes', async () => {
      // Stage a task via create_task
      await callTool(server, 'create_task', {
        milestoneId: '12345678-1234-1234-1234-123456789abc',
        subject: 'Test Task'
      });
      const result = await callTool(server, 'list_pending_operations', {});
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
      expect(parsed.operations[0].type).toBe('create_task');
    });

    it('execute_operation approves and executes a staged write', async () => {
      await callTool(server, 'create_task', {
        milestoneId: '12345678-1234-1234-1234-123456789abc',
        subject: 'Test Task'
      });
      crm.request.mockResolvedValueOnce({ ok: true, status: 201, data: { activityid: 'new-task-1' } });
      const result = await callTool(server, 'execute_operation', { id: 'OP-1' });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.executed).toBe('OP-1');
    });

    it('execute_operation returns error for missing op', async () => {
      const result = await callTool(server, 'execute_operation', { id: 'OP-999' });
      expect(result.isError).toBe(true);
    });

    it('cancel_operation rejects a staged write', async () => {
      await callTool(server, 'create_task', {
        milestoneId: '12345678-1234-1234-1234-123456789abc',
        subject: 'Test Task'
      });
      const result = await callTool(server, 'cancel_operation', { id: 'OP-1' });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.cancelled).toBe('OP-1');
      // Verify it's gone
      const list = await callTool(server, 'list_pending_operations', {});
      const listParsed = JSON.parse(list.content[0].text);
      expect(listParsed.count).toBe(0);
    });

    it('execute_all executes all pending ops', async () => {
      await callTool(server, 'create_task', {
        milestoneId: '12345678-1234-1234-1234-123456789abc',
        subject: 'Task A'
      });
      await callTool(server, 'create_task', {
        milestoneId: '12345678-1234-1234-1234-123456789abc',
        subject: 'Task B'
      });
      crm.request.mockResolvedValue({ ok: true, status: 201, data: {} });
      const result = await callTool(server, 'execute_all', {});
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.executed).toBe(2);
      expect(parsed.failed).toBe(0);
    });

    it('cancel_all cancels all pending ops', async () => {
      await callTool(server, 'create_task', {
        milestoneId: '12345678-1234-1234-1234-123456789abc',
        subject: 'Task A'
      });
      await callTool(server, 'create_task', {
        milestoneId: '12345678-1234-1234-1234-123456789abc',
        subject: 'Task B'
      });
      const result = await callTool(server, 'cancel_all', {});
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.cancelled).toBe(2);
    });
  });
});
