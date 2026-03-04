#!/usr/bin/env node

/**
 * Cross-platform environment initializer for mcaps-copilot-tools.
 *
 * Usage:
 *   node scripts/init.js          # install + build all MCP servers
 *   node scripts/init.js --check  # verify environment without installing
 *
 * Exit codes:
 *   0 — success
 *   1 — one or more steps failed
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";

// ── repo root (scripts/ lives one level below) ──────────────────────
const ROOT = resolve(import.meta.dirname, "..");

// ── MCP server definitions ──────────────────────────────────────────
// Each entry describes an MCP sub-project and the commands needed to
// initialise it.  Add new entries here as new servers appear.
const SERVERS = [
  {
    name: "msx-crm",
    dir: join(ROOT, "mcp", "msx"),
    install: "npm install",
    build: null, // plain JS — no build step
    verify: "src/index.js",
  },
  {
    name: "oil (Obsidian Intelligence Layer)",
    dir: join(ROOT, "mcp", "oil"),
    install: "npm install",
    build: "npm run build",
    verify: "dist/index.js",
  },
];

// ── prerequisite checks ─────────────────────────────────────────────
const PREREQS = [
  { cmd: "node --version", label: "Node.js", minMajor: 18 },
  { cmd: "npm --version", label: "npm" },
];

// ── helpers ─────────────────────────────────────────────────────────
const isWindows = process.platform === "win32";

function run(cmd, cwd) {
  execSync(cmd, {
    cwd,
    stdio: "inherit",
    shell: isWindows ? "cmd.exe" : "/bin/sh",
  });
}

function tryRun(cmd) {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

function heading(text) {
  const bar = "─".repeat(60);
  console.log(`\n${bar}\n  ${text}\n${bar}`);
}

function ok(msg) {
  console.log(`  ✔ ${msg}`);
}
function warn(msg) {
  console.log(`  ⚠ ${msg}`);
}
function fail(msg) {
  console.log(`  ✖ ${msg}`);
}

// ── prerequisite validation ─────────────────────────────────────────
function checkPrereqs() {
  heading("Checking prerequisites");
  let passed = true;

  for (const { cmd, label, minMajor } of PREREQS) {
    const version = tryRun(cmd);
    if (!version) {
      fail(`${label} not found — install it before continuing.`);
      passed = false;
      continue;
    }
    if (minMajor) {
      const major = parseInt(version.replace(/^v/, ""), 10);
      if (major < minMajor) {
        fail(`${label} ${version} found — need v${minMajor}+`);
        passed = false;
        continue;
      }
    }
    ok(`${label} ${version}`);
  }

  // Azure CLI — optional but recommended
  const azVersion = tryRun("az version --query '\"azure-cli\"' -o tsv");
  if (azVersion) {
    ok(`Azure CLI ${azVersion}`);

    // Check if the user is actually signed in
    const account = tryRun("az account show --query user.name -o tsv");
    if (account) {
      ok(`Signed in as ${account}`);
    } else {
      warn("Azure CLI installed but not signed in — run: az login");
    }
  } else {
    warn("Azure CLI not found — needed for CRM authentication.");
    warn("  Install: https://learn.microsoft.com/cli/azure/install-azure-cli");
  }

  return passed;
}

// ── server initialization ───────────────────────────────────────────
function initServers() {
  let allOk = true;
  for (const server of SERVERS) {
    heading(`Initializing ${server.name}`);

    if (!existsSync(server.dir)) {
      fail(`Directory not found: ${server.dir}`);
      allOk = false;
      continue;
    }

    try {
      console.log(`  → ${server.install}`);
      run(server.install, server.dir);
      ok("Dependencies installed");

      if (server.build) {
        console.log(`  → ${server.build}`);
        run(server.build, server.dir);
        ok("Build succeeded");
      }

      const artifact = join(server.dir, server.verify);
      if (existsSync(artifact)) {
        ok(`Entry point verified: ${server.verify}`);
      } else {
        warn(`Expected entry point not found: ${server.verify}`);
      }
    } catch (err) {
      fail(`Failed — ${err.message}`);
      allOk = false;
    }
  }
  return allOk;
}

// ── check-only mode ─────────────────────────────────────────────────
function checkOnly() {
  const prereqsOk = checkPrereqs();

  heading("Checking MCP servers");
  let serversOk = true;
  for (const server of SERVERS) {
    const nodeModules = join(server.dir, "node_modules");
    const artifact = join(server.dir, server.verify);
    const installed = existsSync(nodeModules);
    const built = existsSync(artifact);

    if (installed && built) {
      ok(`${server.name} — ready`);
    } else if (installed && !server.build) {
      ok(`${server.name} — ready (no build step)`);
    } else {
      const missing = [];
      if (!installed) missing.push("npm install");
      if (server.build && !built) missing.push(server.build);
      fail(`${server.name} — needs: ${missing.join(", ")}`);
      serversOk = false;
    }
  }

  if (prereqsOk && serversOk) {
    heading("Environment is ready ✔");
  } else {
    heading("Environment has issues — run `node scripts/init.js` to fix");
  }
  return prereqsOk && serversOk;
}

// ── main ────────────────────────────────────────────────────────────
const checkMode = process.argv.includes("--check");

if (checkMode) {
  const ok = checkOnly();
  process.exit(ok ? 0 : 1);
} else {
  const prereqsOk = checkPrereqs();
  if (!prereqsOk) {
    console.log("\nFix prerequisite issues above, then re-run this script.");
    process.exit(1);
  }
  const serversOk = initServers();
  if (serversOk) {
    heading("All done ✔");

    // Check if already signed in to provide the right next step
    const account = tryRun("az account show --query user.name -o tsv");
    if (account) {
      console.log(`
  You're signed in as ${account}. Everything is ready!

  Next steps:
    1. Open this repo in VS Code:  code .
    2. MCP servers auto-start via .vscode/mcp.json
    3. Open Copilot chat (Cmd+Shift+I) and try: "Who am I in MSX?"

  Or use GitHub Copilot CLI:  copilot
`);
    } else {
      console.log(`
  Next steps:
    1. Connect to Microsoft VPN
    2. Sign in to Azure:        az login
    3. Open this repo in VS Code:  code .
    4. MCP servers auto-start via .vscode/mcp.json
    5. Open Copilot chat (Cmd+Shift+I) and try: "Who am I in MSX?"

  Or use GitHub Copilot CLI:  copilot
`);
    }
  } else {
    heading("Some steps failed — see errors above");
    process.exit(1);
  }
}
