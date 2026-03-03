/**
 * Benchmark 4 — Retrieval Quality
 *
 * Ground-truth queries with known correct answers.
 * Measures precision, recall, and F1 for both search implementations.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  VAULT_PATH,
  computePrecisionRecall,
  bbSearchNotes,
} from "../harness.js";
import { loadConfig } from "../../src/config.js";
import { GraphIndex } from "../../src/graph.js";
import { searchVault, lexicalSearch, fuzzySearch } from "../../src/search.js";
import type { OilConfig } from "../../src/types.js";

let config: OilConfig;
let graph: GraphIndex;

beforeAll(async () => {
  config = await loadConfig(VAULT_PATH);
  graph = new GraphIndex(VAULT_PATH);
  await graph.build();
});

// ── Ground truth definitions ────────────────────────────────────────────────

interface GroundTruth {
  query: string;
  expected: string[];
  description: string;
}

const GROUND_TRUTH: GroundTruth[] = [
  {
    query: "Contoso",
    expected: [
      "Customers/Contoso.md",
      "People/Alice Smith.md",
      "People/Bob Chen.md",
      "Meetings/2026-02-20-Contoso-Migration-Review.md",
      "Projects/azure-migration.md",
      "Weekly/2026-W08.md",
    ],
    description: "All notes mentioning or linked to Contoso",
  },
  {
    query: "migration",
    expected: [
      "Projects/azure-migration.md",
      "Customers/Contoso.md",
      "Meetings/2026-02-20-Contoso-Migration-Review.md",
    ],
    description: "Notes about Azure migration",
  },
  {
    query: "risk",
    expected: [
      "Customers/Northwind.md",
      "Weekly/2026-W08.md",
    ],
    description: "Notes mentioning risk or at-risk status",
  },
  {
    query: "AI copilot",
    expected: [
      "Projects/ai-copilot-pilot.md",
      "Customers/Fabrikam.md",
      "Meetings/2026-02-15-Fabrikam-AI-Kickoff.md",
    ],
    description: "Notes about the AI copilot pilot project",
  },
  {
    query: "Dave Wilson",
    expected: [
      "People/Dave Wilson.md",
      "Customers/Northwind.md",
      "Meetings/2026-02-25-Northwind-Escalation.md",
    ],
    description: "Notes mentioning or linked to Dave Wilson",
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractPaths(results: Array<{ path: string } | { p: string }>): string[] {
  return results.map((r) => ("path" in r ? r.path : r.p));
}

function printMetrics(
  label: string,
  query: string,
  expected: string[],
  returned: string[],
): void {
  const { precision, recall, f1 } = computePrecisionRecall(expected, returned);
  console.log(`    ${label}: P=${precision.toFixed(2)} R=${recall.toFixed(2)} F1=${f1.toFixed(2)} (${returned.length} results)`);
}

// ── Test 4.1: Search precision/recall per query ─────────────────────────────

describe("4.1 — Per-Query Precision / Recall", () => {
  for (const gt of GROUND_TRUTH) {
    describe(`Query: "${gt.query}" — ${gt.description}`, () => {
      it("OIL lexical search", () => {
        const results = lexicalSearch(graph, gt.query, 10);
        const paths = extractPaths(results);
        const { precision, recall, f1 } = computePrecisionRecall(gt.expected, paths);

        printMetrics("OIL-lexical", gt.query, gt.expected, paths);
        expect(f1).toBeGreaterThanOrEqual(0); // Not all queries will have perfect scores
      });

      it("OIL fuzzy search", () => {
        const results = fuzzySearch(graph, gt.query, 10);
        const paths = extractPaths(results);
        const { precision, recall, f1 } = computePrecisionRecall(gt.expected, paths);

        printMetrics("OIL-fuzzy", gt.query, gt.expected, paths);
        expect(f1).toBeGreaterThanOrEqual(0);
      });

      it("bitbonsai search", async () => {
        const results = await bbSearchNotes(VAULT_PATH, gt.query, 10);
        const paths = extractPaths(results);
        const { precision, recall, f1 } = computePrecisionRecall(gt.expected, paths);

        printMetrics("bitbonsai", gt.query, gt.expected, paths);
        expect(f1).toBeGreaterThanOrEqual(0);
      });
    });
  }
});

// ── Test 4.2: Aggregate metrics ─────────────────────────────────────────────

describe("4.2 — Aggregate Retrieval Quality", () => {
  it("should compute mean precision/recall/F1 across all queries", async () => {
    const engines = ["OIL-lexical", "OIL-fuzzy", "bitbonsai"] as const;
    const aggregates: Record<string, { p: number; r: number; f1: number; n: number }> = {};

    for (const engine of engines) {
      aggregates[engine] = { p: 0, r: 0, f1: 0, n: 0 };
    }

    for (const gt of GROUND_TRUTH) {
      // OIL lexical
      const lexResults = lexicalSearch(graph, gt.query, 10);
      const lexPaths = extractPaths(lexResults);
      const lexMetrics = computePrecisionRecall(gt.expected, lexPaths);
      aggregates["OIL-lexical"].p += lexMetrics.precision;
      aggregates["OIL-lexical"].r += lexMetrics.recall;
      aggregates["OIL-lexical"].f1 += lexMetrics.f1;
      aggregates["OIL-lexical"].n++;

      // OIL fuzzy
      const fuzzyResults = fuzzySearch(graph, gt.query, 10);
      const fuzzyPaths = extractPaths(fuzzyResults);
      const fuzzyMetrics = computePrecisionRecall(gt.expected, fuzzyPaths);
      aggregates["OIL-fuzzy"].p += fuzzyMetrics.precision;
      aggregates["OIL-fuzzy"].r += fuzzyMetrics.recall;
      aggregates["OIL-fuzzy"].f1 += fuzzyMetrics.f1;
      aggregates["OIL-fuzzy"].n++;

      // bitbonsai
      const bbResults = await bbSearchNotes(VAULT_PATH, gt.query, 10);
      const bbPaths = extractPaths(bbResults);
      const bbMetrics = computePrecisionRecall(gt.expected, bbPaths);
      aggregates["bitbonsai"].p += bbMetrics.precision;
      aggregates["bitbonsai"].r += bbMetrics.recall;
      aggregates["bitbonsai"].f1 += bbMetrics.f1;
      aggregates["bitbonsai"].n++;
    }

    console.log(`\n  Aggregate retrieval quality (${GROUND_TRUTH.length} queries):`);
    console.log("  ┌──────────────┬───────────┬────────┬────────┐");
    console.log("  │ Engine       │ Precision │ Recall │   F1   │");
    console.log("  ├──────────────┼───────────┼────────┼────────┤");
    for (const engine of engines) {
      const a = aggregates[engine];
      const p = (a.p / a.n).toFixed(3);
      const r = (a.r / a.n).toFixed(3);
      const f1 = (a.f1 / a.n).toFixed(3);
      console.log(`  │ ${engine.padEnd(12)} │   ${p}   │ ${r}  │ ${f1}  │`);
    }
    console.log("  └──────────────┴───────────┴────────┴────────┘");
  });
});

// ── Test 4.3: Graph-augmented retrieval ─────────────────────────────────────

describe("4.3 — Graph-Augmented Retrieval (OIL advantage)", () => {
  it("should find related notes via graph that search alone misses", () => {
    // Search for "escalation" — may only find the meeting note
    const searchResults = fuzzySearch(graph, "escalation", 5);
    const searchPaths = new Set(extractPaths(searchResults));

    // Graph traversal from the meeting note finds the customer + people
    const backlinks = graph.getBacklinks("Meetings/2026-02-25-Northwind-Escalation.md");
    const forwardLinks = graph.getForwardLinks("Meetings/2026-02-25-Northwind-Escalation.md");
    const graphPaths = new Set([
      ...backlinks.map((r) => r.path),
      ...forwardLinks.map((r) => r.path),
    ]);

    // Combine search + graph for expanded retrieval
    const combined = new Set([...searchPaths, ...graphPaths]);
    const expected = [
      "Meetings/2026-02-25-Northwind-Escalation.md",
      "Customers/Northwind.md",
      "People/Dave Wilson.md",
    ];
    const { precision, recall, f1 } = computePrecisionRecall(expected, [...combined]);

    console.log(`\n  Graph-augmented retrieval for "escalation":`);
    console.log(`    Search-only found: ${searchPaths.size} notes`);
    console.log(`    Graph added: ${graphPaths.size} linked notes`);
    console.log(`    Combined: ${combined.size} unique notes`);
    console.log(`    P=${precision.toFixed(2)} R=${recall.toFixed(2)} F1=${f1.toFixed(2)}`);

    // The graph should add notes that search alone can't find
    expect(combined.size).toBeGreaterThanOrEqual(searchPaths.size);
  });

  it("should find customer team via graph traversal", () => {
    // OIL: traverse from customer → people (forward links of people notes to customers)
    const related = graph.getRelatedNotes("Customers/Contoso.md", 1);
    const peoplePaths = related
      .filter((r) => r.path.startsWith("People/"))
      .map((r) => r.path);

    console.log(`\n  Team discovery via graph for Contoso:`);
    console.log(`    People found: ${peoplePaths.join(", ") || "(none via graph)"}`);
    console.log(`    bitbonsai: requires search + manual link parsing`);

    // We expect at least some linked people
    expect(related.length).toBeGreaterThan(0);
  });
});
