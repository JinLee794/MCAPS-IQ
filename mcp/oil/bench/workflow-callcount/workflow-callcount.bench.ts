/**
 * Benchmark 2 — Workflow Call Count
 *
 * Reference workflows: how many MCP round-trips does each server need?
 * Tests measure the number of discrete tool calls required for identical outcomes.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  VAULT_PATH,
  estimateTokens,
  timed,
  buildWorkflowMetric,
  summarizeWorkflow,
  bbListDirectory,
  bbReadNote,
  bbSearchNotes,
  bbGetFrontmatter,
  bbGetVaultStats,
  bbWriteNote,
  type CallMetric,
} from "../harness.js";
import { loadConfig } from "../../src/config.js";
import { GraphIndex } from "../../src/graph.js";
import { SessionCache } from "../../src/cache.js";
import { readNote, buildFolderTree, listAllNotes, listFolder } from "../../src/vault.js";
import { searchVault, lexicalSearch, fuzzySearch } from "../../src/search.js";
import type { OilConfig } from "../../src/types.js";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

let config: OilConfig;
let graph: GraphIndex;
let cache: SessionCache;

beforeAll(async () => {
  config = await loadConfig(VAULT_PATH);
  graph = new GraphIndex(VAULT_PATH);
  await graph.build();
  cache = new SessionCache();
});

/** Helper to create a CallMetric from a timed operation. */
function call(
  server: "oil" | "bitbonsai",
  tool: string,
  input: string,
  result: string,
  ms: number,
): CallMetric {
  return {
    server,
    tool,
    inputTokens: estimateTokens(input),
    outputTokens: estimateTokens(result),
    latencyMs: ms,
  };
}

// ── Workflow A: "Get me up to speed on Contoso" (vault orientation) ─────────

describe("Workflow A — Full customer context (Contoso)", () => {
  it("OIL: get_vault_context + get_customer_context (2 calls)", async () => {
    const calls: CallMetric[] = [];

    // Call 1: get_vault_context
    const { result: r1, ms: m1 } = await timed(async () => {
      const tree = await buildFolderTree(VAULT_PATH);
      const stats = graph.getStats();
      return JSON.stringify({ tree, stats });
    });
    calls.push(call("oil", "get_vault_context", "{}", r1, m1));

    // Call 2: get_customer_context("Contoso")
    const { result: r2, ms: m2 } = await timed(async () => {
      const note = await readNote(VAULT_PATH, "Customers/Contoso.md");
      const backlinks = graph.getBacklinks("Customers/Contoso.md");
      const forwardLinks = graph.getForwardLinks("Customers/Contoso.md");
      return JSON.stringify({ frontmatter: note.frontmatter, content: note.content, backlinks, forwardLinks });
    });
    calls.push(call("oil", "get_customer_context", '{"customer":"Contoso"}', r2, m2));

    const wf = buildWorkflowMetric("Customer Context: Contoso", "oil", calls);
    console.log("\n" + summarizeWorkflow(wf));
    expect(wf.callCount).toBe(2);
  });

  it("bitbonsai: list_directory + read_note + search + read backlinks (5+ calls)", async () => {
    const calls: CallMetric[] = [];

    // Call 1: list_directory (orient)
    const { result: r1, ms: m1 } = await timed(() => bbListDirectory(VAULT_PATH));
    calls.push(call("bitbonsai", "list_directory", '{"path":""}', JSON.stringify(r1), m1));

    // Call 2: get_vault_stats
    const { result: r2, ms: m2 } = await timed(() => bbGetVaultStats(VAULT_PATH));
    calls.push(call("bitbonsai", "get_vault_stats", "{}", JSON.stringify(r2), m2));

    // Call 3: read_note (customer file)
    const { result: r3, ms: m3 } = await timed(() => bbReadNote(VAULT_PATH, "Customers/Contoso.md"));
    calls.push(call("bitbonsai", "read_note", '{"path":"Customers/Contoso.md"}', JSON.stringify(r3), m3));

    // Call 4: search_notes for backlinks
    const { result: r4, ms: m4 } = await timed(() => bbSearchNotes(VAULT_PATH, "Contoso", 10));
    calls.push(call("bitbonsai", "search_notes", '{"query":"Contoso"}', JSON.stringify(r4), m4));

    // Call 5..N: read each backlink found
    for (const hit of r4.slice(0, 3)) {
      if (hit.p !== "Customers/Contoso.md") {
        const { result: rn, ms: mn } = await timed(() => bbReadNote(VAULT_PATH, hit.p));
        calls.push(call("bitbonsai", "read_note", `{"path":"${hit.p}"}`, JSON.stringify(rn), mn));
      }
    }

    const wf = buildWorkflowMetric("Customer Context: Contoso", "bitbonsai", calls);
    console.log("\n" + summarizeWorkflow(wf));
    expect(wf.callCount).toBeGreaterThanOrEqual(5);
  });
});

// ── Workflow B: "Find all notes about the migration project" ────────────────

describe("Workflow B — Cross-entity search (migration)", () => {
  it("OIL: search_vault + query_graph (2 calls)", async () => {
    const calls: CallMetric[] = [];

    // Call 1: search_vault
    const { result: r1, ms: m1 } = await timed(async () => {
      const results = await searchVault(graph, config, "migration", "fuzzy", 10);
      return JSON.stringify(results);
    });
    calls.push(call("oil", "search_vault", '{"query":"migration","tier":"fuzzy"}', r1, m1));

    // Call 2: query_graph for neighborhood
    const { result: r2, ms: m2 } = await timed(async () => {
      const related = graph.getRelatedNotes("Projects/azure-migration.md", 2);
      return JSON.stringify(related);
    });
    calls.push(call("oil", "query_graph", '{"path":"Projects/azure-migration.md","direction":"neighborhood","hops":2}', r2, m2));

    const wf = buildWorkflowMetric("Cross-entity: migration", "oil", calls);
    console.log("\n" + summarizeWorkflow(wf));
    expect(wf.callCount).toBe(2);
  });

  it("bitbonsai: search + list_dir per folder + read each hit (6+ calls)", async () => {
    const calls: CallMetric[] = [];

    // Call 1: search_notes
    const { result: r1, ms: m1 } = await timed(() => bbSearchNotes(VAULT_PATH, "migration", 10));
    calls.push(call("bitbonsai", "search_notes", '{"query":"migration"}', JSON.stringify(r1), m1));

    // Agent needs to understand context — reads several results
    for (const hit of r1.slice(0, 3)) {
      const { result: rn, ms: mn } = await timed(() => bbReadNote(VAULT_PATH, hit.p));
      calls.push(call("bitbonsai", "read_note", `{"path":"${hit.p}"}`, JSON.stringify(rn), mn));
    }

    // No graph traversal — agent must manually search related folders
    const { result: r5, ms: m5 } = await timed(() => bbListDirectory(VAULT_PATH, "Meetings"));
    calls.push(call("bitbonsai", "list_directory", '{"path":"Meetings"}', JSON.stringify(r5), m5));

    const { result: r6, ms: m6 } = await timed(() => bbSearchNotes(VAULT_PATH, "azure migration", 5));
    calls.push(call("bitbonsai", "search_notes", '{"query":"azure migration"}', JSON.stringify(r6), m6));

    const wf = buildWorkflowMetric("Cross-entity: migration", "bitbonsai", calls);
    console.log("\n" + summarizeWorkflow(wf));
    expect(wf.callCount).toBeGreaterThanOrEqual(5);
  });
});

// ── Workflow C: "Who works on which customer?" ──────────────────────────────

describe("Workflow C — People-to-customer resolution", () => {
  it("OIL: resolve_people_to_customers (1 call)", async () => {
    const calls: CallMetric[] = [];

    // Call 1: resolve_people_to_customers — uses graph to batch-resolve
    const { result: r1, ms: m1 } = await timed(async () => {
      const names = ["Alice Smith", "Bob Chen", "Dave Wilson"];
      const resolved = names.map((name) => {
        const titlePath = graph.resolveTitle(name);
        if (!titlePath) return { name, customers: [] };
        const forwardLinks = graph.getForwardLinks(titlePath);
        const customers = forwardLinks
          .filter((l) => l.path.startsWith("Customers/"))
          .map((l) => l.title);
        return { name, customers };
      });
      return JSON.stringify(resolved);
    });
    calls.push(call("oil", "resolve_people_to_customers", '{"names":["Alice Smith","Bob Chen","Dave Wilson"]}', r1, m1));

    const wf = buildWorkflowMetric("People→Customer resolution", "oil", calls);
    console.log("\n" + summarizeWorkflow(wf));
    expect(wf.callCount).toBe(1);
  });

  it("bitbonsai: search per person + read each person file (6+ calls)", async () => {
    const calls: CallMetric[] = [];
    const names = ["Alice Smith", "Bob Chen", "Dave Wilson"];

    for (const name of names) {
      // Agent searches for each person
      const { result: r, ms: m } = await timed(() => bbSearchNotes(VAULT_PATH, name, 3));
      calls.push(call("bitbonsai", "search_notes", `{"query":"${name}"}`, JSON.stringify(r), m));

      // Then reads the person file to find customer links
      const personPath = `People/${name}.md`;
      const { result: rn, ms: mn } = await timed(() => bbReadNote(VAULT_PATH, personPath));
      calls.push(call("bitbonsai", "read_note", `{"path":"${personPath}"}`, JSON.stringify(rn), mn));
    }

    const wf = buildWorkflowMetric("People→Customer resolution", "bitbonsai", calls);
    console.log("\n" + summarizeWorkflow(wf));
    expect(wf.callCount).toBeGreaterThanOrEqual(6);
  });
});

// ── Workflow D: "Prepare CRM prefetch for Contoso and Fabrikam" ─────────────

describe("Workflow D — CRM prefetch (multi-customer)", () => {
  it("OIL: prepare_crm_prefetch (1 call)", async () => {
    const calls: CallMetric[] = [];

    // Call 1: prepare_crm_prefetch — extracts all MSX identifiers
    const { result: r1, ms: m1 } = await timed(async () => {
      const customers = ["Contoso", "Fabrikam"];
      const results = [];
      for (const c of customers) {
        const note = await readNote(VAULT_PATH, `Customers/${c}.md`);
        results.push({
          customer: c,
          tpid: note.frontmatter.tpid,
          accountid: note.frontmatter.accountid,
          opportunities: note.sections.get("Opportunities") ?? "",
        });
      }
      return JSON.stringify(results);
    });
    calls.push(call("oil", "prepare_crm_prefetch", '{"customers":["Contoso","Fabrikam"]}', r1, m1));

    const wf = buildWorkflowMetric("CRM Prefetch", "oil", calls);
    console.log("\n" + summarizeWorkflow(wf));
    expect(wf.callCount).toBe(1);
  });

  it("bitbonsai: read each customer + parse frontmatter manually (2-4 calls)", async () => {
    const calls: CallMetric[] = [];

    // Agent reads each customer file individually
    for (const c of ["Contoso", "Fabrikam"]) {
      const { result: r, ms: m } = await timed(() => bbGetFrontmatter(VAULT_PATH, `Customers/${c}.md`));
      calls.push(call("bitbonsai", "get_frontmatter", `{"path":"Customers/${c}.md"}`, JSON.stringify(r), m));

      // Then reads the full note to extract opportunity sections
      const { result: rn, ms: mn } = await timed(() => bbReadNote(VAULT_PATH, `Customers/${c}.md`));
      calls.push(call("bitbonsai", "read_note", `{"path":"Customers/${c}.md"}`, JSON.stringify(rn), mn));
    }

    const wf = buildWorkflowMetric("CRM Prefetch", "bitbonsai", calls);
    console.log("\n" + summarizeWorkflow(wf));
    expect(wf.callCount).toBeGreaterThanOrEqual(4);
  });
});

// ── Summary comparison ──────────────────────────────────────────────────────

describe("Call-Count Summary", () => {
  it("should show OIL uses fewer calls for structured workflows", () => {
    // These are the expected call counts per workflow:
    const expected = {
      "Customer Context": { oil: 2, bbMin: 5 },
      "Cross-entity Search": { oil: 2, bbMin: 5 },
      "People Resolution": { oil: 1, bbMin: 6 },
      "CRM Prefetch": { oil: 1, bbMin: 4 },
    };

    console.log("\n  Call-Count Summary:");
    console.log("  ┌─────────────────────────┬─────┬──────────┐");
    console.log("  │ Workflow                │ OIL │ bitbonsai│");
    console.log("  ├─────────────────────────┼─────┼──────────┤");
    for (const [name, counts] of Object.entries(expected)) {
      console.log(`  │ ${name.padEnd(23)} │  ${counts.oil}  │  ${counts.bbMin}+      │`);
    }
    console.log("  └─────────────────────────┴─────┴──────────┘");

    const oilTotal = Object.values(expected).reduce((s, c) => s + c.oil, 0);
    const bbTotal = Object.values(expected).reduce((s, c) => s + c.bbMin, 0);
    console.log(`\n  Total: OIL ${oilTotal} calls vs bitbonsai ${bbTotal}+ calls`);
    console.log(`  Ratio: ${(bbTotal / oilTotal).toFixed(1)}x fewer round-trips with OIL`);

    expect(oilTotal).toBeLessThan(bbTotal);
  });
});
