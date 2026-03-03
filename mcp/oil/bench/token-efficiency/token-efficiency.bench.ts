/**
 * Benchmark 1 — Token Efficiency
 *
 * Measures the per-turn context tax and per-call response size
 * for both servers against the same fixture vault.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  VAULT_PATH,
  estimateTokens,
  totalSchemaTokens,
  OIL_TOOL_SCHEMAS,
  BB_TOOL_SCHEMAS,
  timed,
  bbReadNote,
  bbListDirectory,
  bbSearchNotes,
  bbGetVaultStats,
  bbGetFrontmatter,
  type CallMetric,
} from "../harness.js";
import { loadConfig } from "../../src/config.js";
import { GraphIndex } from "../../src/graph.js";
import { SessionCache } from "../../src/cache.js";
import { readNote, buildFolderTree, listFolder } from "../../src/vault.js";
import { searchVault } from "../../src/search.js";
import type { OilConfig } from "../../src/types.js";

let config: OilConfig;
let graph: GraphIndex;
let cache: SessionCache;

beforeAll(async () => {
  config = await loadConfig(VAULT_PATH);
  graph = new GraphIndex(VAULT_PATH);
  await graph.build();
  cache = new SessionCache();
});

// ── Test 1.1: Schema overhead ───────────────────────────────────────────────

describe("1.1 — Schema Overhead (per-turn context tax)", () => {
  it("should count OIL tool schema tokens", () => {
    const oilTokens = totalSchemaTokens(OIL_TOOL_SCHEMAS);
    const oilToolCount = Object.keys(OIL_TOOL_SCHEMAS).length;
    console.log(`\n  OIL: ${oilToolCount} tools, ~${oilTokens} schema tokens per turn`);
    expect(oilTokens).toBeGreaterThan(0);
  });

  it("should count bitbonsai tool schema tokens", () => {
    const bbTokens = totalSchemaTokens(BB_TOOL_SCHEMAS);
    const bbToolCount = Object.keys(BB_TOOL_SCHEMAS).length;
    console.log(`\n  bitbonsai: ${bbToolCount} tools, ~${bbTokens} schema tokens per turn`);
    expect(bbTokens).toBeGreaterThan(0);
  });

  it("should compare schema overhead ratio", () => {
    const oilTokens = totalSchemaTokens(OIL_TOOL_SCHEMAS);
    const bbTokens = totalSchemaTokens(BB_TOOL_SCHEMAS);
    const ratio = oilTokens / bbTokens;
    console.log(`\n  Schema ratio (OIL / bitbonsai): ${ratio.toFixed(2)}x`);
    console.log(`  OIL overhead per turn: +${oilTokens - bbTokens} tokens`);
    // OIL will have higher schema overhead — it's the expected trade-off
    expect(ratio).toBeGreaterThan(1);
  });
});

// ── Test 1.2: Response payload comparison ───────────────────────────────────

describe("1.2 — Response Payload Sizes", () => {
  it("should compare vault orientation payloads", async () => {
    // OIL: get_vault_context (1 call)
    const { result: oilResult, ms: oilMs } = await timed(async () => {
      const folderStructure = await buildFolderTree(VAULT_PATH);
      const stats = graph.getStats();
      return JSON.stringify({ folderStructure, stats, schemaVersion: "0.4.0" });
    });
    const oilTokens = estimateTokens(oilResult);

    // bitbonsai: list_directory + get_vault_stats (2 calls)
    const { result: bbResult1 } = await timed(() => bbListDirectory(VAULT_PATH));
    const { result: bbResult2 } = await timed(() => bbGetVaultStats(VAULT_PATH));
    const bbResult = JSON.stringify(bbResult1) + JSON.stringify(bbResult2);
    const bbTokens = estimateTokens(bbResult);

    console.log(`\n  Vault orientation:`);
    console.log(`    OIL (1 call):  ~${oilTokens} tokens, ${oilMs.toFixed(1)}ms`);
    console.log(`    bitbonsai (2 calls): ~${bbTokens} tokens`);
    console.log(`    Payload ratio: ${(oilTokens / bbTokens).toFixed(2)}x`);
    expect(oilTokens).toBeGreaterThan(0);
    expect(bbTokens).toBeGreaterThan(0);
  });

  it("should compare customer context payloads", async () => {
    // OIL: get_customer_context("Contoso") — single structured call
    const { result: oilResult, ms: oilMs } = await timed(async () => {
      const note = await readNote(VAULT_PATH, "Customers/Contoso.md");
      // Simulate the full customer context assembly
      const backlinks = graph.getBacklinks("Customers/Contoso.md");
      const forwardLinks = graph.getForwardLinks("Customers/Contoso.md");
      return JSON.stringify({
        frontmatter: note.frontmatter,
        content: note.content,
        opportunities: [
          { name: "Azure Migration Phase 2", guid: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" },
        ],
        team: [{ name: "Alice Smith", role: "CSA" }],
        backlinks,
        forwardLinks,
      });
    });
    const oilTokens = estimateTokens(oilResult);

    // bitbonsai: read_note + search_notes + read_multiple backlinks (3+ calls)
    const { result: bbNote } = await timed(() => bbReadNote(VAULT_PATH, "Customers/Contoso.md"));
    const { result: bbSearch } = await timed(() => bbSearchNotes(VAULT_PATH, "Contoso", 10));
    // Would need additional read_note calls for each backlink
    const bbResult = JSON.stringify(bbNote) + JSON.stringify(bbSearch);
    const bbTokens = estimateTokens(bbResult);

    console.log(`\n  Customer context (Contoso):`);
    console.log(`    OIL (1 call):  ~${oilTokens} tokens, ${oilMs.toFixed(1)}ms`);
    console.log(`    bitbonsai (2+ calls): ~${bbTokens} tokens (incomplete — no backlinks)`);
    expect(oilTokens).toBeGreaterThan(0);
    expect(bbTokens).toBeGreaterThan(0);
  });

  it("should compare search result payloads", async () => {
    // OIL: search_vault — structured SearchResult[]
    const { result: oilResult, ms: oilMs } = await timed(async () => {
      const results = await searchVault(graph, config, "migration", "fuzzy", 5);
      return JSON.stringify(results);
    });
    const oilTokens = estimateTokens(oilResult);

    // bitbonsai: search_notes — minified field names
    const { result: bbResult, ms: bbMs } = await timed(() =>
      bbSearchNotes(VAULT_PATH, "migration", 5),
    );
    const bbJson = JSON.stringify(bbResult);
    const bbTokens = estimateTokens(bbJson);

    console.log(`\n  Search "migration":`);
    console.log(`    OIL:  ~${oilTokens} tokens, ${oilMs.toFixed(1)}ms`);
    console.log(`    bitbonsai: ~${bbTokens} tokens, ${bbMs.toFixed(1)}ms`);
    console.log(`    Payload ratio: ${bbTokens > 0 ? (oilTokens / bbTokens).toFixed(2) : "N/A"}x`);
    expect(oilTokens).toBeGreaterThan(0);
  });
});

// ── Test 1.3: Per-turn total cost model ─────────────────────────────────────

describe("1.3 — Per-Turn Total Cost Model", () => {
  it("should estimate total tokens per agent turn (schema + avg response)", async () => {
    const oilSchema = totalSchemaTokens(OIL_TOOL_SCHEMAS);
    const bbSchema = totalSchemaTokens(BB_TOOL_SCHEMAS);

    // Simulate a typical turn: orient + one query
    const oilOrient = await buildFolderTree(VAULT_PATH);
    const oilOrientTokens = estimateTokens(JSON.stringify(oilOrient));

    const bbOrient = await bbListDirectory(VAULT_PATH);
    const bbOrientTokens = estimateTokens(JSON.stringify(bbOrient));

    const oilTurnTotal = oilSchema + oilOrientTokens;
    const bbTurnTotal = bbSchema + bbOrientTokens;

    console.log(`\n  Per-turn cost model (schema + orient response):`);
    console.log(`    OIL:  ${oilSchema} schema + ${oilOrientTokens} response = ${oilTurnTotal} total`);
    console.log(`    bitbonsai: ${bbSchema} schema + ${bbOrientTokens} response = ${bbTurnTotal} total`);
    console.log(`    Ratio: ${(oilTurnTotal / bbTurnTotal).toFixed(2)}x`);
    expect(oilTurnTotal).toBeGreaterThan(0);
    expect(bbTurnTotal).toBeGreaterThan(0);
  });
});
