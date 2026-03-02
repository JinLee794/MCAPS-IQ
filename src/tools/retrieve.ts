/**
 * OIL — Retrieve tools
 * Higher-level retrieval tools: search, query, similarity.
 * All fully autonomous (no confirmation gate).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GraphIndex } from "../graph.js";
import type { SessionCache } from "../cache.js";
import type { OilConfig, NoteRef } from "../types.js";
import { queryNotes } from "../query.js";
import { searchVault } from "../search.js";
import type { EmbeddingIndex } from "../embeddings.js";

/**
 * Register all Retrieve tools on the MCP server.
 */
export function registerRetrieveTools(
  server: McpServer,
  vaultPath: string,
  graph: GraphIndex,
  cache: SessionCache,
  config: OilConfig,
  embeddings: EmbeddingIndex | null,
): void {
  // ── search_vault ──────────────────────────────────────────────────────

  server.registerTool(
    "search_vault",
    {
      description: "Unified search across lexical and fuzzy tiers. Returns ranked results matching the query.",
      inputSchema: {
        query: z.string().describe("Search query text"),
        tier: z
          .enum(["lexical", "fuzzy", "semantic"])
          .optional()
          .describe("Search tier (default: from config)"),
        limit: z.number().optional().describe("Max results (default: 10)"),
        filter_folder: z.string().optional().describe("Restrict to this folder prefix"),
        filter_tags: z.array(z.string()).optional().describe("Restrict to notes with these tags"),
      },
    },
    async ({ query, tier, limit, filter_folder, filter_tags }) => {
      const results = await searchVault(graph, config, query, tier, limit ?? 10, {
        folder: filter_folder,
        tags: filter_tags,
      }, embeddings);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    },
  );

  // ── query_notes ───────────────────────────────────────────────────────

  server.registerTool(
    "query_notes",
    {
      description: "Frontmatter predicate query — relational-style filtering across all notes. The SQL-like layer for the vault.",
      inputSchema: {
        where: z
          .record(z.string(), z.unknown())
          .describe("Filter predicates: { field: value } matched against frontmatter"),
        and: z
          .array(z.record(z.string(), z.unknown()))
          .optional()
          .describe("Additional predicates that ALL must match"),
        or: z
          .array(z.record(z.string(), z.unknown()))
          .optional()
          .describe("Additional predicates where at LEAST ONE must match"),
        order_by: z
          .string()
          .optional()
          .describe("Field to sort by (prefix with - for descending)"),
        limit: z.number().optional().describe("Max results (default: all)"),
        folder: z.string().optional().describe("Restrict to notes in this folder prefix"),
      },
    },
    async ({ where, and, or, order_by, limit, folder }) => {
      const results = queryNotes(graph, config, {
        where,
        and,
        or,
        orderBy: order_by,
        limit,
        folder,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    },
  );

  // ── find_similar_notes ────────────────────────────────────────────────

  server.registerTool(
    "find_similar_notes",
    {
      description: "Tag-based similarity to a given note — surfaces relevant patterns, comparable customers, or risk signals.",
      inputSchema: {
        path: z.string().describe("Note path to find similar notes for"),
        top_n: z.number().optional().describe("Max results (default: 5)"),
        method: z
          .enum(["tags", "semantic"])
          .optional()
          .describe("Similarity method (default: tags; semantic reserved for Phase 4)"),
      },
    },
    async ({ path, top_n, method }) => {
      const limit = top_n ?? 5;
      const sourceNode = graph.getNode(path);
      if (!sourceNode) {
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: `Note not found: ${path}` }) },
          ],
        };
      }

      // Semantic similarity when requested and available
      if (
        method === "semantic" &&
        embeddings &&
        (await embeddings.isAvailable())
      ) {
        const semanticResults = await embeddings.findSimilar(path, limit);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(semanticResults, null, 2) },
          ],
        };
      }

      // Tag-based similarity: count shared tags
      const sourceTags = new Set(sourceNode.tags);
      if (sourceTags.size === 0) {
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ results: [], message: "Source note has no tags" }) },
          ],
        };
      }

      const scored: { ref: NoteRef; score: number }[] = [];
      const allRefs = graph.getNotesByFolder("");
      for (const ref of allRefs) {
        if (ref.path === path) continue;
        const node = graph.getNode(ref.path);
        if (!node) continue;

        const shared = node.tags.filter((t) => sourceTags.has(t)).length;
        if (shared > 0) {
          // Jaccard-like score: shared / union
          const union = new Set([...sourceTags, ...node.tags]).size;
          scored.push({
            ref: { path: ref.path, title: ref.title, tags: ref.tags },
            score: shared / union,
          });
        }
      }

      scored.sort((a, b) => b.score - a.score);
      const results = scored.slice(0, limit).map((s) => ({
        ...s.ref,
        similarityScore: Math.round(s.score * 100) / 100,
      }));

      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    },
  );
}
