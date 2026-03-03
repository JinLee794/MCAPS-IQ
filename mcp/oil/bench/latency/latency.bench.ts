/**
 * Benchmark 3 — Latency
 *
 * Measures cold-start time, warm-call performance, and search tier latency
 * for both servers against the same fixture vault.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  VAULT_PATH,
  timed,
  bbListDirectory,
  bbReadNote,
  bbSearchNotes,
  bbGetVaultStats,
} from "../harness.js";
import { loadConfig } from "../../src/config.js";
import { GraphIndex } from "../../src/graph.js";
import { SessionCache } from "../../src/cache.js";
import { readNote, buildFolderTree, listAllNotes } from "../../src/vault.js";
import { searchVault, lexicalSearch, fuzzySearch, invalidateSearchIndex } from "../../src/search.js";
import type { OilConfig } from "../../src/types.js";

// ── Test 3.1: Cold start ────────────────────────────────────────────────────

describe("3.1 — Cold Start Latency", () => {
  it("OIL: graph build from scratch", async () => {
    const graph = new GraphIndex(VAULT_PATH);
    const { ms } = await timed(() => graph.build());
    const stats = graph.getStats();

    console.log(`\n  OIL cold start (graph build): ${ms.toFixed(1)}ms`);
    console.log(`    Indexed: ${stats.noteCount} notes, ${stats.edgeCount} edges`);
    expect(ms).toBeGreaterThan(0);
    expect(stats.noteCount).toBeGreaterThan(0);
  });

  it("bitbonsai: stateless — no cold start cost", async () => {
    // bitbonsai has no index to build; the "cold start" is just the first call
    const { ms } = await timed(() => bbGetVaultStats(VAULT_PATH));

    console.log(`\n  bitbonsai cold start (first call): ${ms.toFixed(1)}ms`);
    console.log(`    No index built — first real cost is on first query`);
    expect(ms).toBeGreaterThan(0);
  });
});

// ── Test 3.2: Warm-call performance ─────────────────────────────────────────

describe("3.2 — Warm-Call Performance (10-iteration avg)", () => {
  let config: OilConfig;
  let graph: GraphIndex;

  beforeAll(async () => {
    config = await loadConfig(VAULT_PATH);
    graph = new GraphIndex(VAULT_PATH);
    await graph.build();
  });

  const ITERATIONS = 10;

  async function avgMs(fn: () => Promise<unknown>): Promise<number> {
    // Warm up
    await fn();
    let total = 0;
    for (let i = 0; i < ITERATIONS; i++) {
      const { ms } = await timed(fn);
      total += ms;
    }
    return total / ITERATIONS;
  }

  it("read single note", async () => {
    const oilAvg = await avgMs(() => readNote(VAULT_PATH, "Customers/Contoso.md"));
    const bbAvg = await avgMs(() => bbReadNote(VAULT_PATH, "Customers/Contoso.md"));

    console.log(`\n  Read "Customers/Contoso.md" (avg of ${ITERATIONS}):`);
    console.log(`    OIL:      ${oilAvg.toFixed(2)}ms`);
    console.log(`    bitbonsai: ${bbAvg.toFixed(2)}ms`);
    console.log(`    Ratio: ${(oilAvg / bbAvg).toFixed(2)}x`);
    expect(oilAvg).toBeGreaterThan(0);
  });

  it("list vault folder tree", async () => {
    const oilAvg = await avgMs(() => buildFolderTree(VAULT_PATH));
    const bbAvg = await avgMs(() => bbListDirectory(VAULT_PATH));

    console.log(`\n  List vault structure (avg of ${ITERATIONS}):`);
    console.log(`    OIL (buildFolderTree):   ${oilAvg.toFixed(2)}ms`);
    console.log(`    bitbonsai (list_directory): ${bbAvg.toFixed(2)}ms`);
    console.log(`    Ratio: ${(oilAvg / bbAvg).toFixed(2)}x`);
    expect(oilAvg).toBeGreaterThan(0);
  });

  it("graph lookup (backlinks)", async () => {
    const oilAvg = await avgMs(async () => graph.getBacklinks("Customers/Contoso.md"));

    console.log(`\n  Graph: backlinks for Contoso (avg of ${ITERATIONS}):`);
    console.log(`    OIL:      ${oilAvg.toFixed(4)}ms (in-memory lookup)`);
    console.log(`    bitbonsai: N/A — no graph capability`);
    expect(oilAvg).toBeLessThan(5); // In-memory should be sub-millisecond
  });

  it("graph lookup (related notes 2-hop)", async () => {
    const oilAvg = await avgMs(async () => graph.getRelatedNotes("Customers/Contoso.md", 2));

    console.log(`\n  Graph: 2-hop neighborhood for Contoso (avg of ${ITERATIONS}):`);
    console.log(`    OIL:      ${oilAvg.toFixed(4)}ms (in-memory BFS)`);
    console.log(`    bitbonsai: N/A — requires manual multi-hop search`);
    expect(oilAvg).toBeLessThan(10);
  });
});

// ── Test 3.3: Search tier comparison ────────────────────────────────────────

describe("3.3 — Search Tier Latency", () => {
  let config: OilConfig;
  let graph: GraphIndex;

  beforeAll(async () => {
    config = await loadConfig(VAULT_PATH);
    graph = new GraphIndex(VAULT_PATH);
    await graph.build();
  });

  const ITERATIONS = 10;
  const queries = ["migration", "Contoso", "AI copilot", "risk"];

  async function avgSearchMs(
    fn: (q: string) => Promise<unknown>,
    query: string,
  ): Promise<number> {
    await fn(query); // warm up
    let total = 0;
    for (let i = 0; i < ITERATIONS; i++) {
      const { ms } = await timed(() => fn(query));
      total += ms;
    }
    return total / ITERATIONS;
  }

  it("lexical search comparison", async () => {
    console.log(`\n  Lexical search (avg of ${ITERATIONS}):`);
    for (const q of queries) {
      const oilAvg = await avgSearchMs(
        (query) => Promise.resolve(lexicalSearch(graph, query, 5)),
        q,
      );
      const bbAvg = await avgSearchMs(
        (query) => bbSearchNotes(VAULT_PATH, query, 5),
        q,
      );
      console.log(`    "${q}": OIL ${oilAvg.toFixed(2)}ms vs bitbonsai ${bbAvg.toFixed(2)}ms (${(bbAvg / oilAvg).toFixed(1)}x)`);
    }
  });

  it("fuzzy search comparison", async () => {
    console.log(`\n  Fuzzy search (avg of ${ITERATIONS}):`);
    for (const q of queries) {
      const oilAvg = await avgSearchMs(
        (query) => Promise.resolve(fuzzySearch(graph, query, 5)),
        q,
      );
      const bbAvg = await avgSearchMs(
        (query) => bbSearchNotes(VAULT_PATH, query, 5),
        q,
      );
      console.log(`    "${q}": OIL ${oilAvg.toFixed(2)}ms vs bitbonsai ${bbAvg.toFixed(2)}ms (${(bbAvg / oilAvg).toFixed(1)}x)`);
    }
  });
});

// ── Test 3.4: Amortization model ────────────────────────────────────────────

describe("3.4 — Amortization: cold start vs query savings", () => {
  it("should estimate break-even point (graph build cost / per-query savings)", async () => {
    // 1. Measure cold start
    const freshGraph = new GraphIndex(VAULT_PATH);
    const { ms: coldMs } = await timed(() => freshGraph.build());
    const freshConfig = await loadConfig(VAULT_PATH);

    // 2. Measure per-query cost difference
    const queryIter = 20;
    let oilTotal = 0;
    let bbTotal = 0;
    for (let i = 0; i < queryIter; i++) {
      const { ms: oMs } = await timed(async () => {
        fuzzySearch(freshGraph, "migration", 5);
        freshGraph.getBacklinks("Customers/Contoso.md");
      });
      oilTotal += oMs;

      const { ms: bMs } = await timed(async () => {
        await bbSearchNotes(VAULT_PATH, "migration", 5);
        await bbSearchNotes(VAULT_PATH, "Contoso", 5);
      });
      bbTotal += bMs;
    }

    const oilPerQuery = oilTotal / queryIter;
    const bbPerQuery = bbTotal / queryIter;
    const savedPerQuery = bbPerQuery - oilPerQuery;
    const breakEven = savedPerQuery > 0 ? Math.ceil(coldMs / savedPerQuery) : Infinity;

    console.log(`\n  Amortization model:`);
    console.log(`    Cold start: ${coldMs.toFixed(1)}ms`);
    console.log(`    OIL per-query: ${oilPerQuery.toFixed(2)}ms`);
    console.log(`    bitbonsai per-query: ${bbPerQuery.toFixed(2)}ms`);
    console.log(`    Savings per query: ${savedPerQuery.toFixed(2)}ms`);
    console.log(`    Break-even: after ~${breakEven} queries`);
    expect(coldMs).toBeGreaterThan(0);
  });
});
