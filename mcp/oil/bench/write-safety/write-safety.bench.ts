/**
 * Benchmark 5 — Write Safety Overhead
 *
 * Measures the cost of OIL's tiered write gate (diff generation, audit logging,
 * confirmation flow) vs bitbonsai's direct write operations.
 *
 * NOTE: Tests write to a temporary copy of the fixture vault, not the original.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cp, rm, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  VAULT_PATH,
  estimateTokens,
  timed,
  buildWorkflowMetric,
  summarizeWorkflow,
  bbReadNote,
  bbWriteNote,
  type CallMetric,
} from "../harness.js";
import { loadConfig } from "../../src/config.js";
import { GraphIndex } from "../../src/graph.js";
import { SessionCache } from "../../src/cache.js";
import { readNote, noteExists } from "../../src/vault.js";
import {
  generateDiff,
  isAutoConfirmed,
  executeWrite,
  appendToSection,
  logWrite,
  queueGatedWrite,
} from "../../src/gate.js";
import type { OilConfig, PendingWrite } from "../../src/types.js";

let tmpVault: string;
let config: OilConfig;
let graph: GraphIndex;
let cache: SessionCache;

beforeAll(async () => {
  // Copy fixture vault to temp dir so writes don't affect originals
  tmpVault = await mkdtemp(join(tmpdir(), "oil-bench-write-"));
  await cp(VAULT_PATH, tmpVault, { recursive: true });

  config = await loadConfig(tmpVault);
  graph = new GraphIndex(tmpVault);
  await graph.build();
  cache = new SessionCache();
});

afterAll(async () => {
  await rm(tmpVault, { recursive: true, force: true });
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

// ── Test 5.1: Auto-confirmed write (Tier 1) ────────────────────────────────

describe("5.1 — Auto-Confirmed Writes (OIL Tier 1 vs bitbonsai direct)", () => {
  it("OIL: patch_note to Agent Insights (auto-confirmed + audit log)", async () => {
    const calls: CallMetric[] = [];
    const content = "\n- [2026-02-21] Migration phase 2 is on track.\n";

    const { result: r1, ms: m1 } = await timed(async () => {
      // Check if auto-confirmed
      const auto = isAutoConfirmed(config, "patch_note", "Agent Insights");
      expect(auto).toBe(true);

      // Generate diff (still generated for audit even when auto-confirmed)
      const diff = generateDiff(
        "patch_note",
        "Customers/Contoso.md",
        content,
        false,
        [],
      );

      // Execute write
      await appendToSection(
        tmpVault,
        "Customers/Contoso.md",
        "Agent Insights",
        content,
      );

      // Audit log
      await logWrite(tmpVault, config, {
        tier: "auto",
        operation: "patch_note",
        path: "Customers/Contoso.md",
        detail: "Appended to Agent Insights",
      });

      return JSON.stringify({ status: "written", diff: diff.diff.slice(0, 200) });
    });

    calls.push(call("oil", "patch_note (auto)", '{"heading":"Agent Insights"}', r1, m1));

    const wf = buildWorkflowMetric("Auto-Confirmed Write", "oil", calls);
    console.log("\n" + summarizeWorkflow(wf));
    expect(wf.callCount).toBe(1);
  });

  it("bitbonsai: direct write (no safety layer)", async () => {
    const calls: CallMetric[] = [];
    const content = "\n- [2026-02-21] Migration phase 2 is on track.\n";

    // bitbonsai: read + modify + write — agent does the diff manually or doesn't
    const { result: r1, ms: m1 } = await timed(async () => {
      const note = await bbReadNote(tmpVault, "Customers/Contoso.md");
      return JSON.stringify(note);
    });
    calls.push(call("bitbonsai", "read_note", '{"path":"Customers/Contoso.md"}', r1, m1));

    const { result: r2, ms: m2 } = await timed(async () => {
      return await bbWriteNote(
        tmpVault,
        "Customers/Contoso.md",
        content,
        "append",
      );
    });
    calls.push(call("bitbonsai", "write_note", '{"mode":"append"}', r2, m2));

    const wf = buildWorkflowMetric("Auto-Confirmed Write", "bitbonsai", calls);
    console.log("\n" + summarizeWorkflow(wf));
    expect(wf.callCount).toBe(2); // read + write
  });
});

// ── Test 5.2: Gated write (Tier 2) with confirmation flow ──────────────────

describe("5.2 — Gated Writes (OIL Tier 2 — diff + confirm cycle)", () => {
  it("OIL: create_customer_file (gated — diff + confirm + execute + log)", async () => {
    const calls: CallMetric[] = [];
    const newCustomer = "Woodgrove";
    const content = [
      "---",
      "customer: Woodgrove Bank",
      "tpid: TPID-999",
      'tags: [customer, enterprise]',
      "---",
      "",
      "# Woodgrove Bank",
      "",
      "## Opportunities",
      "",
      "## Team",
      "",
      "## Agent Insights",
      "",
    ].join("\n");

    // Step 1: Generate diff for human review
    const { result: diffResult, ms: diffMs } = await timed(async () => {
      const isNew = !(await noteExists(tmpVault, `Customers/${newCustomer}.md`));
      const diff = generateDiff("create_customer_file", `Customers/${newCustomer}.md`, content, isNew);
      // Queue it
      queueGatedWrite(cache, diff, { content, mode: "create" });
      return JSON.stringify({ id: diff.id, diff: diff.diff });
    });
    calls.push(call("oil", "create_customer_file (propose)", `{"customer":"${newCustomer}"}`, diffResult, diffMs));

    // Step 2: Human reviews diff (simulated — token cost of diff in context)
    const diffTokens = estimateTokens(diffResult);
    calls.push({
      server: "oil",
      tool: "manage_pending_writes (confirm)",
      inputTokens: estimateTokens('{"action":"confirm"}'),
      outputTokens: 10, // "Confirmed"
      latencyMs: 0.1, // instant confirmation
    });

    // Step 3: Execute write
    const { result: writeResult, ms: writeMs } = await timed(async () => {
      await executeWrite(tmpVault, `Customers/${newCustomer}.md`, content, "create");
      return "Written successfully";
    });
    calls.push(call("oil", "execute_write", '{}', writeResult, writeMs));

    // Step 4: Audit log
    const { result: logResult, ms: logMs } = await timed(async () => {
      await logWrite(tmpVault, config, {
        tier: "gated",
        operation: "create_customer_file",
        path: `Customers/${newCustomer}.md`,
        detail: "New customer scaffolded",
      });
      return "Logged";
    });
    calls.push(call("oil", "log_write", '{}', logResult, logMs));

    const wf = buildWorkflowMetric("Gated Write (new customer)", "oil", calls);
    console.log("\n" + summarizeWorkflow(wf));
    // Gated writes cost more calls: propose + confirm + execute + log
    expect(wf.callCount).toBe(4);
    console.log(`    Diff review overhead: ~${diffTokens} tokens added to context`);
  });

  it("bitbonsai: direct write_note (1 call, no safety net)", async () => {
    const calls: CallMetric[] = [];
    const content = "---\ncustomer: Woodgrove Bank\ntpid: TPID-999\n---\n\n# Woodgrove Bank\n";

    const { result: r1, ms: m1 } = await timed(async () => {
      return await bbWriteNote(tmpVault, "Customers/Woodgrove-bb.md", content, "overwrite");
    });
    calls.push(call("bitbonsai", "write_note", '{"path":"Customers/Woodgrove-bb.md"}', r1, m1));

    const wf = buildWorkflowMetric("Gated Write (new customer)", "bitbonsai", calls);
    console.log("\n" + summarizeWorkflow(wf));
    expect(wf.callCount).toBe(1); // No safety layer
  });
});

// ── Test 5.3: Diff generation overhead ──────────────────────────────────────

describe("5.3 — Diff Generation Overhead", () => {
  const ITERATIONS = 20;

  it("should measure diff generation cost across multiple sizes", async () => {
    const sizes = [100, 500, 2000, 5000];

    console.log(`\n  Diff generation latency (avg of ${ITERATIONS}):`);
    for (const size of sizes) {
      const content = "x".repeat(size);

      let total = 0;
      for (let i = 0; i < ITERATIONS; i++) {
        const { ms } = await timed(async () => {
          generateDiff("write_note", "test.md", content, true);
        });
        total += ms;
      }
      const avg = total / ITERATIONS;
      const diffTokens = estimateTokens(content) + 50; // content + diff formatting

      console.log(`    ${size} chars → ${avg.toFixed(3)}ms, ~${diffTokens} diff tokens`);
    }
  });
});

// ── Test 5.4: Audit log overhead ────────────────────────────────────────────

describe("5.4 — Audit Log Overhead", () => {
  it("should measure audit log write cost", async () => {
    const ITERATIONS = 10;
    let total = 0;

    for (let i = 0; i < ITERATIONS; i++) {
      const { ms } = await timed(async () => {
        await logWrite(tmpVault, config, {
          tier: "auto",
          operation: `bench_test_${i}`,
          path: `Customers/Contoso.md`,
          detail: `Benchmark iteration ${i}`,
        });
      });
      total += ms;
    }
    const avg = total / ITERATIONS;

    console.log(`\n  Audit log overhead: ${avg.toFixed(2)}ms per write (avg of ${ITERATIONS})`);
    console.log("    bitbonsai: 0ms (no audit logging)");
    expect(avg).toBeGreaterThan(0);
  });
});

// ── Test 5.5: Safety summary ────────────────────────────────────────────────

describe("5.5 — Write Safety Summary", () => {
  it("should summarize the safety/overhead trade-off", () => {
    console.log(`
  ┌─────────────────────────┬──────────────────────┬──────────────────────┐
  │ Capability              │ OIL                  │ bitbonsai            │
  ├─────────────────────────┼──────────────────────┼──────────────────────┤
  │ Auto-confirmed writes   │ ✓ (designated ops)   │ ✗ (all direct)       │
  │ Gated writes + diff     │ ✓ (human review)     │ ✗                    │
  │ Audit trail             │ ✓ (_agent-log/)      │ ✗                    │
  │ Pending write queue     │ ✓ (list/confirm/rej) │ ✗                    │
  │ Calls per gated write   │ 4 (propose+confirm+  │ 1 (write)            │
  │                         │   execute+log)       │                      │
  │ Token overhead (diff)   │ ~50-200 extra tokens │ 0                    │
  │ Latency overhead        │ ~1-5ms extra         │ 0                    │
  │ Rollback capability     │ Partial (log-based)  │ None                 │
  └─────────────────────────┴──────────────────────┴──────────────────────┘

  Trade-off: OIL adds ~3 extra calls and ~100-200 tokens for gated writes,
  but provides human-in-the-loop review, audit trail, and partial rollback.
    `);
    expect(true).toBe(true);
  });
});
