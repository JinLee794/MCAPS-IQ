/**
 * OIL — Write tools
 * Tiered write operations: auto-confirmed (Tier 1) and gated (Tier 2).
 * Plus confirmation/rejection tools for the gated flow.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GraphIndex } from "../graph.js";
import type { SessionCache } from "../cache.js";
import type { OilConfig } from "../types.js";
import { readNote, noteExists, securePath } from "../vault.js";
import {
  isAutoConfirmed,
  generateDiff,
  generateCompactBatchDiff,
  executeWrite,
  appendToSection,
  logWrite,
  queueGatedWrite,
  confirmWrite as confirmWriteOp,
  rejectWrite as rejectWriteOp,
} from "../gate.js";

/**
 * Register all Write tools on the MCP server.
 */
export function registerWriteTools(
  server: McpServer,
  vaultPath: string,
  graph: GraphIndex,
  cache: SessionCache,
  config: OilConfig,
): void {
  // ── patch_note ────────────────────────────────────────────────────────

  server.registerTool(
    "patch_note",
    {
      description: "Appends content to a specific heading section within a note. Auto-confirmed for designated sections (Agent Insights, Connect Hooks); gated for others.",
      inputSchema: {
        path: z.string().describe("Note path within the vault"),
        heading: z.string().describe('Target heading (e.g. "Agent Insights")'),
        content: z.string().describe("Content to append"),
        operation: z
          .enum(["append", "prepend"])
          .optional()
          .describe("Append or prepend (default: append)"),
      },
    },
    async ({ path, heading, content, operation }) => {
      const op = operation ?? "append";
      const autoConfirm = isAutoConfirmed(config, "patch_note", heading);

      if (autoConfirm) {
        // Tier 1 — execute immediately
        await appendToSection(vaultPath, path, heading, content, op);
        cache.invalidateNote(path);

        await logWrite(vaultPath, config, {
          tier: "auto",
          operation: "patch_note",
          path,
          detail: `${op} to §${heading}`,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "executed",
                path,
                heading,
                operation: op,
              }),
            },
          ],
        };
      }

      // Tier 2 — generate diff and queue
      const diff = generateDiff(
        "patch_note",
        path,
        `[${op} to §${heading}]\n\n${content}`,
        false,
      );
      queueGatedWrite(cache, diff, {
        content: JSON.stringify({ heading, content: content, op }),
        mode: "append",
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ status: "pending", writeId: diff.id, diff: diff.diff }),
          },
        ],
      };
    },
  );

  // ── capture_connect_hook ──────────────────────────────────────────────

  server.registerTool(
    "capture_connect_hook",
    {
      description: "Appends a formatted Connect hook entry to the customer file and backup location. Always auto-confirmed.",
      inputSchema: {
        customer: z.string().describe("Customer name"),
        hook: z.object({
          date: z.string().describe("ISO date"),
          circles: z
            .array(z.enum(["Individual", "Team/Org", "Customer/Business"]))
            .describe("Circles of impact"),
          hook: z.string().describe("What happened"),
          evidence: z.string().describe("Measurable proof"),
          source: z.string().describe("PR / Issue / Doc / Thread"),
          next_step: z.string().describe("Suggested next step"),
        }),
      },
    },
    async ({ customer, hook }) => {
      const customerFile = `${config.schema.customersRoot}${customer}.md`;

      // Format the hook entry  
      const entry = [
        `- **${hook.date}** | ${hook.circles.join(", ")}`,
        `  - Hook: ${hook.hook}`,
        `  - Evidence: ${hook.evidence}`,
        `  - Source: ${hook.source}`,
        `  - Next: ${hook.next_step}`,
      ].join("\n");

      // Primary: append to customer file § Connect Hooks
      const fileExists = await noteExists(vaultPath, customerFile);
      if (fileExists) {
        await appendToSection(vaultPath, customerFile, "Connect Hooks", entry);
        cache.invalidateNote(customerFile);
      }

      // Backup: append to .connect/hooks/hooks.md
      const backupPath = config.schema.connectHooksBackup;
      const backupEntry = `\n### ${customer} — ${hook.date}\n${entry}\n`;
      const backupExists = await noteExists(vaultPath, backupPath);
      if (backupExists) {
        await executeWrite(vaultPath, backupPath, backupEntry, "append");
      } else {
        const header = `---\ntags: [connect-hooks]\n---\n\n# Connect Hooks Backup\n${backupEntry}`;
        await executeWrite(vaultPath, backupPath, header, "create");
      }

      await logWrite(vaultPath, config, {
        tier: "auto",
        operation: "capture_connect_hook",
        path: customerFile,
        detail: `Hook captured: ${hook.hook}`,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: "executed",
              customerFile,
              backupPath,
            }),
          },
        ],
      };
    },
  );

  // ── log_agent_action ──────────────────────────────────────────────────

  server.registerTool(
    "log_agent_action",
    {
      description: "Records an agent decision, recommendation, or reasoning trace to _agent-log/. Always auto-confirmed — audit trail only.",
      inputSchema: {
        action: z.string().describe("Description of the action taken"),
        context: z.record(z.string(), z.unknown()).describe("Structured context about the action"),
        session_id: z.string().describe("Session identifier for grouping"),
      },
    },
    async ({ action, context, session_id }) => {
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const timeStr = now.toISOString().slice(11, 19);
      const logPath = `${config.schema.agentLog}${dateStr}.md`;

      const entry = [
        "",
        `### ${timeStr} — ${action}`,
        `- **Session:** ${session_id}`,
        ...Object.entries(context).map(
          ([k, v]) => `- **${k}:** ${typeof v === "string" ? v : JSON.stringify(v)}`,
        ),
        "",
      ].join("\n");

      const exists = await noteExists(vaultPath, logPath);
      if (!exists) {
        const header = `---\ndate: ${dateStr}\ntags: [agent-log]\n---\n\n# Agent Log — ${dateStr}\n`;
        await executeWrite(vaultPath, logPath, header + entry, "create");
      } else {
        await executeWrite(vaultPath, logPath, entry, "append");
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ status: "executed", logPath }),
          },
        ],
      };
    },
  );

  // ── draft_meeting_note ────────────────────────────────────────────────

  server.registerTool(
    "draft_meeting_note",
    {
      description: "Generates a structured meeting note. Gated — returns a diff for review before creation.",
      inputSchema: {
        customer: z.string().describe("Customer name"),
        content: z.string().describe("Transcript, bullet summary, or notes"),
        attendees: z.array(z.string()).optional().describe("Meeting attendees"),
        date: z.string().optional().describe("Meeting date (ISO format, default: today)"),
        title: z.string().optional().describe("Meeting title (auto-generated if omitted)"),
      },
    },
    async ({ customer, content, attendees, date, title }) => {
      const meetingDate = date ?? new Date().toISOString().slice(0, 10);
      const meetingTitle = title ?? `${customer} Meeting`;
      const filename = `${meetingDate} - ${meetingTitle}.md`;
      const meetingPath = `${config.schema.meetingsRoot}${filename}`;

      // Build frontmatter
      const fm: Record<string, unknown> = {
        date: meetingDate,
        customer,
        tags: ["meeting"],
      };
      if (attendees?.length) {
        fm.action_owners = attendees;
      }

      // Build note content
      const fmYaml = Object.entries(fm)
        .map(([k, v]) =>
          Array.isArray(v) ? `${k}: [${v.join(", ")}]` : `${k}: ${v}`,
        )
        .join("\n");

      const noteContent = [
        "---",
        fmYaml,
        "---",
        "",
        `# ${meetingTitle}`,
        "",
        content,
        "",
      ].join("\n");

      // Generate diff (gated)
      const sideEffects: string[] = [
        `\`${config.schema.customersRoot}${customer}.md\` § \`## Agent Insights\` ← append: meeting summary (auto-confirmed)`,
      ];

      const diff = generateDiff("draft_meeting_note", meetingPath, noteContent, true, sideEffects);
      queueGatedWrite(cache, diff, { content: noteContent, mode: "create" });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ status: "pending", writeId: diff.id, diff: diff.diff }),
          },
        ],
      };
    },
  );

  // ── update_customer_file ──────────────────────────────────────────────

  server.registerTool(
    "update_customer_file",
    {
      description: "Proposes updates to a customer file's frontmatter or sections. Gated — returns a diff for review.",
      inputSchema: {
        customer: z.string().describe("Customer name"),
        frontmatter: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Frontmatter fields to update"),
        sections: z
          .record(z.string(), z.string())
          .optional()
          .describe("Section heading → new content (replaces section content)"),
      },
    },
    async ({ customer, frontmatter, sections }) => {
      const customerFile = `${config.schema.customersRoot}${customer}.md`;

      let parsed = cache.getNote(customerFile);
      if (!parsed) {
        try {
          parsed = await readNote(vaultPath, customerFile);
          cache.putNote(customerFile, parsed);
        } catch {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: `Customer file not found: ${customerFile}` }),
              },
            ],
          };
        }
      }

      // Build the updated note
      const { stringify } = await import("gray-matter");
      const updatedFm = { ...parsed.frontmatter, ...frontmatter };
      let updatedContent = parsed.content;

      if (sections) {
        for (const [heading, newContent] of Object.entries(sections)) {
          const headingPattern = new RegExp(
            `(^#{1,6}\\s+${escapeRegExp(heading)}\\s*$)`,
            "m",
          );
          const match = headingPattern.exec(updatedContent);
          if (match) {
            const headingLevel = match[1].match(/^(#+)/)?.[1].length ?? 2;
            const afterHeading = updatedContent.slice(match.index + match[0].length);
            const nextHeadingPattern = new RegExp(`^#{1,${headingLevel}}\\s+`, "m");
            const nextMatch = nextHeadingPattern.exec(afterHeading);
            const sectionEnd = nextMatch
              ? match.index + match[0].length + nextMatch.index
              : updatedContent.length;

            updatedContent =
              updatedContent.slice(0, match.index + match[0].length) +
              "\n\n" +
              newContent +
              "\n\n" +
              updatedContent.slice(sectionEnd);
          } else {
            updatedContent += `\n\n## ${heading}\n\n${newContent}\n`;
          }
        }
      }

      const fullContent = stringify(updatedContent, updatedFm);
      const diff = generateDiff("update_customer_file", customerFile, fullContent, false);
      queueGatedWrite(cache, diff, { content: fullContent, mode: "overwrite" });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ status: "pending", writeId: diff.id, diff: diff.diff }),
          },
        ],
      };
    },
  );

  // ── create_customer_file ──────────────────────────────────────────────

  server.registerTool(
    "create_customer_file",
    {
      description: "Scaffolds a new customer file when onboarding a new account. Gated — creates a new file in the vault.",
      inputSchema: {
        customer: z.string().describe("Customer name"),
        tpid: z.string().optional().describe("Account TPID"),
        accountid: z.string().optional().describe("Account ID"),
        opportunities: z
          .array(z.object({ name: z.string(), guid: z.string().optional() }))
          .optional()
          .describe("Initial opportunity list"),
        team: z
          .array(z.object({ name: z.string(), role: z.string().optional() }))
          .optional()
          .describe("Initial team members"),
      },
    },
    async ({ customer, tpid, accountid, opportunities, team }) => {
      const customerFile = `${config.schema.customersRoot}${customer}.md`;

      const exists = await noteExists(vaultPath, customerFile);
      if (exists) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Customer file already exists: ${customerFile}. Use update_customer_file instead.`,
              }),
            },
          ],
        };
      }

      // Build frontmatter
      const fm: Record<string, unknown> = {
        tags: ["customer"],
      };
      if (tpid) fm.tpid = tpid;
      if (accountid) fm.accountid = accountid;

      const fmYaml = Object.entries(fm)
        .map(([k, v]) =>
          Array.isArray(v) ? `${k}: [${v.join(", ")}]` : `${k}: ${v}`,
        )
        .join("\n");

      // Build sections
      const sections: string[] = [`# ${customer}`, ""];

      // Opportunities
      sections.push("## Opportunities", "");
      if (opportunities?.length) {
        for (const opp of opportunities) {
          const guidPart = opp.guid ? ` (\`opportunityid: ${opp.guid}\`)` : "";
          sections.push(`- ${opp.name}${guidPart}`);
        }
      } else {
        sections.push("*No opportunities recorded yet.*");
      }
      sections.push("");

      // Team
      sections.push("## Team", "");
      if (team?.length) {
        for (const member of team) {
          const rolePart = member.role ? ` — ${member.role}` : "";
          sections.push(`- [[${member.name}]]${rolePart}`);
        }
      } else {
        sections.push("*No team members recorded yet.*");
      }
      sections.push("");

      // Standard empty sections
      sections.push("## Milestones", "", "*No milestones recorded yet.*", "");
      sections.push("## Agent Insights", "", "");
      sections.push("## Connect Hooks", "", "");

      const noteContent = ["---", fmYaml, "---", "", ...sections].join("\n");

      const diff = generateDiff("create_customer_file", customerFile, noteContent, true);
      queueGatedWrite(cache, diff, { content: noteContent, mode: "create" });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ status: "pending", writeId: diff.id, diff: diff.diff }),
          },
        ],
      };
    },
  );

  // ── write_note ────────────────────────────────────────────────────────

  server.registerTool(
    "write_note",
    {
      description: "Low-level note write wrapped in the confirmation gate. Always gated regardless of mode.",
      inputSchema: {
        path: z.string().describe("Note path within the vault"),
        content: z.string().describe("Full note content (including frontmatter)"),
        mode: z
          .enum(["overwrite", "append", "prepend"])
          .optional()
          .describe("Write mode (default: overwrite)"),
      },
    },
    async ({ path, content, mode }) => {
      const writeMode = mode ?? "overwrite";
      const isNew = !(await noteExists(vaultPath, path));

      const diff = generateDiff(
        "write_note",
        path,
        content,
        isNew,
      );
      const gateMode = writeMode === "overwrite" || isNew ? "create" : "append";
      queueGatedWrite(cache, diff, {
        content,
        mode: gateMode as "create" | "overwrite" | "append",
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ status: "pending", writeId: diff.id, diff: diff.diff }),
          },
        ],
      };
    },
  );

  // ── apply_tags ────────────────────────────────────────────────────────

  server.registerTool(
    "apply_tags",
    {
      description: "Proposes tag additions or removals across a set of notes. Gated — shows a batch diff of all notes affected.",
      inputSchema: {
        paths: z.array(z.string()).describe("Note paths to update"),
        tags: z.array(z.string()).describe("Tags to add or remove"),
        operation: z.enum(["add", "remove"]).describe("Add or remove tags"),
      },
    },
    async ({ paths, tags, operation }) => {
      const diff = generateCompactBatchDiff(
        "apply_tags",
        `${operation} tags [${tags.join(", ")}]`,
        paths.map((p) => ({ path: p, detail: `${operation} [${tags.join(", ")}]` })),
      );

      // Queue with the full operation payload
      queueGatedWrite(cache, diff, {
        content: JSON.stringify({ paths, tags, operation }),
        mode: "overwrite",
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: "pending",
              writeId: diff.id,
              diff: diff.diff,
              notesAffected: paths.length,
            }),
          },
        ],
      };
    },
  );

  // ── manage_pending_writes ───────────────────────────────────────────────

  server.registerTool(
    "manage_pending_writes",
    {
      description:
        'List, confirm, or reject pending gated write operations. Use action "list" to see pending writes, "confirm" to execute one, "reject" to discard one.',
      inputSchema: {
        action: z
          .enum(["list", "confirm", "reject"])
          .describe("What to do with pending writes"),
        write_id: z
          .string()
          .optional()
          .describe("Required for confirm/reject — the write ID returned by the gated tool"),
      },
    },
    async ({ action, write_id }) => {
      // ── list ──────────────────────────────────────────────────────────
      if (action === "list") {
        const pending = cache.listPendingWrites();
        const summary = pending.map((w) => ({
          id: w.id,
          operation: w.operation,
          path: w.path,
          createdAt: w.createdAt.toISOString(),
        }));
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(summary, null, 2),
            },
          ],
        };
      }

      // confirm and reject both require write_id
      if (!write_id) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `write_id is required for action "${action}"`,
              }),
            },
          ],
        };
      }

      // ── reject ────────────────────────────────────────────────────────
      if (action === "reject") {
        const result = rejectWriteOp(cache, write_id);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result) },
          ],
        };
      }

      // ── confirm ───────────────────────────────────────────────────────
      // Special handling for batch promote (from promote_findings)
      const pending = cache.getPendingWrite(write_id);

      if (pending?.operation === "promote_findings") {
        const payload = JSON.parse(pending.diff) as {
          content: string;
          mode: string;
        };
        const innerData = JSON.parse(payload.content) as {
          type: string;
          items: { path: string; section: string; content: string }[];
        };

        if (innerData.type === "batch_promote") {
          let updated = 0;
          for (const item of innerData.items) {
            try {
              await appendToSection(vaultPath, item.path, item.section, item.content);
              cache.invalidateNote(item.path);
              updated++;
            } catch {
              // Skip notes that can't be updated
            }
          }

          await logWrite(vaultPath, config, {
            tier: "gated",
            operation: "promote_findings",
            path: `(${innerData.items.length} note(s))`,
            detail: `Batch promote confirmed — ${updated} updated`,
          });

          cache.removePendingWrite(write_id);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  status: "executed",
                  notesUpdated: updated,
                }),
              },
            ],
          };
        }
      }

      // Special handling for apply_tags
      if (pending?.operation === "apply_tags") {
        const payload = JSON.parse(
          JSON.parse(pending.diff).content,
        ) as {
          paths: string[];
          tags: string[];
          operation: "add" | "remove";
        };

        for (const notePath of payload.paths) {
          try {
            const parsed = await readNote(vaultPath, notePath);
            const currentTags: string[] = Array.isArray(parsed.frontmatter.tags)
              ? (parsed.frontmatter.tags as string[])
              : [];

            let updatedTags: string[];
            if (payload.operation === "add") {
              updatedTags = [...new Set([...currentTags, ...payload.tags])];
            } else {
              const removeSet = new Set(payload.tags);
              updatedTags = currentTags.filter((t) => !removeSet.has(t));
            }

            // Rebuild with updated frontmatter
            const { stringify } = await import("gray-matter");
            const updatedFm = { ...parsed.frontmatter, tags: updatedTags };
            const newContent = stringify(parsed.content, updatedFm);
            await executeWrite(vaultPath, notePath, newContent, "overwrite");
            cache.invalidateNote(notePath);
          } catch {
            // Skip notes that can't be read/updated
          }
        }

        await logWrite(vaultPath, config, {
          tier: "gated",
          operation: "apply_tags",
          path: `(${payload.paths.length} notes)`,
          detail: `${payload.operation} tags [${payload.tags.join(", ")}]`,
        });

        cache.removePendingWrite(write_id);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "executed",
                notesUpdated: payload.paths.length,
              }),
            },
          ],
        };
      }

      // Special handling for gated patch_note
      if (pending?.operation === "patch_note") {
        const innerPayload = JSON.parse(pending.diff) as {
          content: string;
          mode: string;
        };
        const patchData = JSON.parse(innerPayload.content) as {
          heading: string;
          content: string;
          op: "append" | "prepend";
        };

        await appendToSection(
          vaultPath,
          pending.path,
          patchData.heading,
          patchData.content,
          patchData.op,
        );
        cache.invalidateNote(pending.path);

        await logWrite(vaultPath, config, {
          tier: "gated",
          operation: "patch_note",
          path: pending.path,
          detail: `${patchData.op} to §${patchData.heading} — Confirmed`,
        });

        cache.removePendingWrite(write_id);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ status: "executed", path: pending.path }),
            },
          ],
        };
      }

      // Default: standard write execution
      const result = await confirmWriteOp(vaultPath, config, cache, write_id);
      if (result.success && result.path) {
        cache.invalidateNote(result.path);
      }
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result) },
        ],
      };
    },
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
