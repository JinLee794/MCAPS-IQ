/**
 * OIL — Vault filesystem layer
 * Safe file reads, frontmatter parsing, path security, markdown section parsing.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve, extname, basename } from "node:path";
import matter from "gray-matter";
import type {
  NoteFrontmatter,
  NoteRef,
  FolderTree,
  ActionItem,
  OpportunityRef,
  MilestoneRef,
  TeamMember,
} from "./types.js";

// ─── Path Security ────────────────────────────────────────────────────────────

const ALLOWED_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);
const EXCLUDED_DIRS = new Set([".obsidian", ".trash", "node_modules", ".git"]);

/**
 * Validates and resolves a path within the vault.
 * Prevents path traversal attacks outside the vault root.
 */
export function securePath(vaultPath: string, notePath: string): string {
  const resolved = resolve(vaultPath, notePath);
  const rel = relative(vaultPath, resolved);
  if (rel.startsWith("..") || resolve(resolved) !== resolved.replace(/\/$/, "")) {
    throw new Error(`Path traversal denied: ${notePath}`);
  }
  return resolved;
}

/**
 * Check if a file has an allowed extension for reading.
 */
export function isAllowedFile(filePath: string): boolean {
  return ALLOWED_EXTENSIONS.has(extname(filePath).toLowerCase());
}

/**
 * Check if a directory should be excluded from indexing.
 */
function isExcludedDir(dirName: string): boolean {
  return EXCLUDED_DIRS.has(dirName) || dirName.startsWith(".");
}

// ─── Note Reading ─────────────────────────────────────────────────────────────

export interface ParsedNote {
  path: string;
  title: string;
  frontmatter: NoteFrontmatter;
  content: string;
  sections: Map<string, string>;
  wikilinks: string[];
  tags: string[];
}

/**
 * Read and parse a single markdown note — frontmatter, sections, wikilinks.
 */
export async function readNote(
  vaultPath: string,
  notePath: string,
): Promise<ParsedNote> {
  const fullPath = securePath(vaultPath, notePath);
  const raw = await readFile(fullPath, "utf-8");
  return parseNote(notePath, raw);
}

/**
 * Parse a markdown string into a structured note.
 */
export function parseNote(notePath: string, raw: string): ParsedNote {
  const { data: frontmatter, content } = matter(raw);
  const title = extractTitle(notePath, content);
  const sections = parseSections(content);
  const wikilinks = extractWikilinks(content);
  const tags = extractTags(frontmatter, content);

  return {
    path: notePath,
    title,
    frontmatter: frontmatter as NoteFrontmatter,
    content,
    sections,
    wikilinks,
    tags,
  };
}

/**
 * Derive a note title: first H1 heading, then filename.
 */
function extractTitle(notePath: string, content: string): string {
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();
  return basename(notePath, extname(notePath));
}

/**
 * Parse markdown into heading → content sections.
 * Returns a Map of "## Heading" → content beneath it.
 */
export function parseSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = content.split("\n");
  let currentHeading = "";
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (currentHeading) {
        sections.set(currentHeading, currentContent.join("\n").trim());
      }
      currentHeading = headingMatch[2].trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  // Capture last section
  if (currentHeading) {
    sections.set(currentHeading, currentContent.join("\n").trim());
  }

  return sections;
}

/**
 * Extract all `[[wikilinks]]` from content. Returns resolved link targets.
 */
export function extractWikilinks(content: string): string[] {
  const links: string[] = [];
  const regex = /\[\[([^\]|#]+)(?:[|#][^\]]*)?]]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1].trim());
  }
  return [...new Set(links)];
}

/**
 * Extract tags from both frontmatter and inline #tags.
 */
function extractTags(
  frontmatter: Record<string, unknown>,
  content: string,
): string[] {
  const tags = new Set<string>();

  // Frontmatter tags
  const fmTags = frontmatter.tags;
  if (Array.isArray(fmTags)) {
    for (const t of fmTags) {
      if (typeof t === "string") tags.add(t);
    }
  } else if (typeof fmTags === "string") {
    tags.add(fmTags);
  }

  // Inline #tags — match #word but not inside code blocks or links
  const inlineTagRegex = /(?:^|\s)#([a-zA-Z][\w-/]*)/g;
  let match;
  while ((match = inlineTagRegex.exec(content)) !== null) {
    tags.add(match[1]);
  }

  return [...tags];
}

// ─── Vault Traversal ──────────────────────────────────────────────────────────

/**
 * Recursively list all markdown files in the vault.
 */
export async function listAllNotes(vaultPath: string): Promise<string[]> {
  const notes: string[] = [];
  await walkDir(vaultPath, vaultPath, notes);
  return notes;
}

async function walkDir(
  root: string,
  dir: string,
  results: string[],
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!isExcludedDir(entry.name)) {
        await walkDir(root, join(dir, entry.name), results);
      }
    } else if (entry.isFile() && isAllowedFile(entry.name)) {
      results.push(relative(root, join(dir, entry.name)));
    }
  }
}

/**
 * Build a folder tree structure for vault overview.
 */
export async function buildFolderTree(vaultPath: string): Promise<FolderTree> {
  return buildTreeRecursive(vaultPath, vaultPath);
}

async function buildTreeRecursive(
  root: string,
  dir: string,
): Promise<FolderTree> {
  const name = dir === root ? "/" : basename(dir);
  const children: FolderTree[] = [];
  let noteCount = 0;

  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && !isExcludedDir(entry.name)) {
      const child = await buildTreeRecursive(root, join(dir, entry.name));
      children.push(child);
      noteCount += child.noteCount;
    } else if (entry.isFile() && isAllowedFile(entry.name)) {
      noteCount++;
    }
  }

  return { name, children, noteCount };
}

/**
 * List files directly in a specific folder (not recursive).
 */
export async function listFolder(
  vaultPath: string,
  folderPath: string,
): Promise<string[]> {
  const fullPath = securePath(vaultPath, folderPath);
  const entries = await readdir(fullPath, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && isAllowedFile(e.name))
    .map((e) => join(folderPath, e.name));
}

/**
 * Check if a file exists in the vault.
 */
export async function noteExists(
  vaultPath: string,
  notePath: string,
): Promise<boolean> {
  try {
    const fullPath = securePath(vaultPath, notePath);
    await stat(fullPath);
    return true;
  } catch {
    return false;
  }
}

// ─── Section & Entity Parsing ─────────────────────────────────────────────────

/**
 * Parse opportunity references from the ## Opportunities section.
 * Looks for lines with name and optional GUID patterns.
 */
export function parseOpportunities(section: string): OpportunityRef[] {
  const opps: OpportunityRef[] = [];
  const lines = section.split("\n").filter((l) => l.trim());

  for (const line of lines) {
    // Match: - Name (`opportunityid: GUID`) or - Name (GUID)
    const guidMatch = line.match(
      /(?:opportunityid:\s*)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    );
    // Extract name from markdown list item or line start
    const nameMatch = line.match(/^[-*]\s+(?:\[.\]\s+)?(.+?)(?:\s*[\(`]|$)/);

    if (nameMatch) {
      opps.push({
        name: nameMatch[1].trim(),
        guid: guidMatch?.[1],
      });
    } else if (guidMatch) {
      // Line has a GUID but no clear name format
      const cleanLine = line.replace(/[-*]\s+/, "").trim();
      opps.push({
        name: cleanLine.split(/\s*[\(`]/)[0].trim(),
        guid: guidMatch[1],
      });
    }
  }
  return opps;
}

/**
 * Parse milestone references from the ## Milestones section.
 */
export function parseMilestones(section: string): MilestoneRef[] {
  const milestones: MilestoneRef[] = [];
  const lines = section.split("\n").filter((l) => l.trim());

  for (const line of lines) {
    const idMatch = line.match(
      /(?:milestoneid:\s*)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    );
    const numberMatch = line.match(/(?:milestone\s*#?\s*|MS-?)(\d+)/i);
    const nameMatch = line.match(/^[-*]\s+(?:\[.\]\s+)?(.+?)(?:\s*[\(`]|$)/);

    if (nameMatch || idMatch || numberMatch) {
      milestones.push({
        name: nameMatch
          ? nameMatch[1].trim()
          : line.replace(/[-*]\s+/, "").trim(),
        id: idMatch?.[1],
        number: numberMatch?.[1],
      });
    }
  }
  return milestones;
}

/**
 * Parse team members from the ## Team section.
 */
export function parseTeam(section: string): TeamMember[] {
  const team: TeamMember[] = [];
  const lines = section.split("\n").filter((l) => l.trim());

  for (const line of lines) {
    const listMatch = line.match(/^[-*]\s+(?:\[.\]\s+)?(.+)/);
    if (!listMatch) continue;

    const entry = listMatch[1].trim();
    // Match patterns like "Name — Role" or "Name (Role)" or "Name - Role"
    const roleMatch = entry.match(
      /^(.+?)\s*(?:—|–|-|\()\s*(.+?)(?:\))?$/,
    );
    if (roleMatch) {
      team.push({
        name: roleMatch[1].replace(/\[\[|\]\]/g, "").trim(),
        role: roleMatch[2].trim(),
      });
    } else {
      team.push({
        name: entry.replace(/\[\[|\]\]/g, "").trim(),
      });
    }
  }
  return team;
}

/**
 * Parse action items (task syntax: `- [ ]` and `- [x]`) from content.
 */
export function parseActionItems(
  content: string,
  sourcePath: string,
): ActionItem[] {
  const items: ActionItem[] = [];
  const regex = /^[-*]\s+\[([ xX])\]\s+(.+)$/gm;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const done = match[1].toLowerCase() === "x";
    const text = match[2].trim();

    // Try to extract assignee from patterns like "@name" or "[[Name]]"
    const assigneeWiki = text.match(/\[\[([^\]]+)\]\]/);
    const assigneeAt = text.match(/@(\w+)/);

    items.push({
      text,
      source: sourcePath,
      assignee: assigneeWiki?.[1] ?? assigneeAt?.[1],
      done,
    });
  }
  return items;
}

/**
 * Create a NoteRef from a parsed note.
 */
export function toNoteRef(note: ParsedNote): NoteRef {
  const excerpt =
    note.content.slice(0, 200).replace(/\n/g, " ").trim() || undefined;
  return {
    path: note.path,
    title: note.title,
    tags: note.tags,
    excerpt,
  };
}
