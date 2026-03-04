---
description: "First-time setup verification and guided walkthrough. Use after cloning to confirm everything is working."
---

# Getting Started

Run a quick environment check and walk me through first-time setup.

## Steps

1. **Check prerequisites** — verify that MCP servers are installed and built by running `node scripts/init.js --check` in a terminal.
2. **Check Azure sign-in** — run `az account show` to confirm I'm signed in. If not, tell me to run `az login` (remind me I need to be on VPN first).
3. **Verify MCP connectivity** — use `crm_whoami` to confirm CRM is reachable. If it fails, tell me the likely cause (VPN, token expired, etc.).
4. **Suggest a first prompt** — based on my CRM identity, suggest a role-appropriate prompt I can try right now.

If anything fails, give me the exact fix command — don't assume I know my way around a terminal.
