# MCAPS Copilot Tools

![alt text](docs/assets/banner.png)
> **Your AI-powered sales operations toolkit for MCAPS.**
> Talk to Copilot in plain English to manage MSX opportunities, milestones, and tasks — no coding required.

MCAPS Copilot Tools connects GitHub Copilot (in VS Code) to your MSX CRM and Microsoft 365 data through [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) servers. Instead of clicking through MSX screens, you describe what you need in the Copilot chat window and the tools do it for you.

**What can it do?**

- **Read MSX data** — look up opportunities, milestones, tasks, and ownership.
- **Update MSX records** — create tasks, close milestones, update statuses (with confirmation before any write).
- **Search M365 evidence** — find relevant Teams chats, meeting transcripts, emails, and documents via WorkIQ.
- **Role-aware guidance** — the system knows MCAPS roles (SE, CSA, CSAM, Specialist) and tailors its behavior accordingly.

---

## Quick Start (5 Minutes)
![alt text](docs/assets/quickstart.png)

> **Prerequisites:**
> - **Connected to the Microsoft corporate VPN** (required to reach internal CRM endpoints)
> - A **Microsoft corp account** (used for `az login` authentication)
> - A GitHub Copilot-compatible IDE such as [VS Code](https://code.visualstudio.com/) (or [VS Code Insiders](https://code.visualstudio.com/insiders/)) with the [GitHub Copilot extension](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat), **or** [GitHub Copilot CLI](https://github.com/features/copilot/cli/) (`brew install copilot-cli`)
> - [Node.js 18+](https://nodejs.org/)
> - [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)


### Step 1: Clone and install
```bash
git clone https://github.com/JinLee794/mcaps-copilot-tools.git
cd mcaps-copilot-tools

# One command installs everything (both MCP servers + builds)
npm install
```

> **That's it.** `npm install` at the root automatically installs and builds all MCP servers (`mcp/msx` and `mcp/oil`). No need to `cd` into each folder.
>
> **Prefer a GUI?** Open the repo in VS Code and run the **"Setup: Install Everything"** task from the Command Palette (`Cmd+Shift+P` → `Tasks: Run Task` → `Setup: Install Everything`).

> **Note:** `mcp/msx` and `mcp/oil` are [git subtrees](https://www.atlassian.com/git/tutorials/git-subtree) — they live in this repo as normal files but are also maintained in their own standalone repos. No special clone flags needed.

### Step 2: Sign in to Azure

The MSX CRM tools authenticate through Azure CLI. Make sure you are **connected to the Microsoft VPN** and sign in with your **Microsoft corp account**:

```bash
az login
```

> **Important:** You must be on the corporate VPN and use a Microsoft account (e.g., `your-alias@microsoft.com`). Personal or third-party accounts will not have access to MSX CRM.

### Step 3: Open the repo in VS Code — or Copilot CLI

**Option A: VS Code**
```bash
# from the repo root
code .
```

**Option B: [GitHub Copilot CLI](https://github.com/features/copilot/cli/)**
```bash
# from the repo root — starts a terminal-native agentic session
copilot
```
Copilot CLI automatically detects `.vscode/mcp.json`, `AGENTS.md`, and `.github/skills/` in the repo. If using the CLI, skip Steps 4–5 — the MCP servers start on demand and you can begin prompting immediately. See [Alternative: Use with GitHub Copilot CLI](#alternative-use-with-github-copilot-cli) for install and usage details.

### Step 4: Start the MCP servers

1. Open the file `.vscode/mcp.json` in VS Code. You should see a **"Start"** button above each server definition.
2. Click **Start** on `msx-crm` (required) and `workiq` (optional, for M365 searches).
3. That's it — the tools are now available inside Copilot chat.

### Step 5: Open Copilot and start chatting

Open the GitHub Copilot chat panel (`Ctrl+Shift+I` / `Cmd+Shift+I`) and try the built-in getting started prompt:

1. Type `/` in the Copilot chat window
2. Select **getting-started** — it will verify your environment and suggest your first prompt based on your CRM role

Or just type: `Who am I in MSX?`

> **Something not working?** Run the environment check from the Command Palette: `Cmd+Shift+P` → `Tasks: Run Task` → `Setup: Check Environment`. It will tell you exactly what's missing.

---

## Alternative: Use with GitHub Copilot CLI

[GitHub Copilot CLI](https://github.com/features/copilot/cli/) is a terminal-native agentic coding agent that supports MCP servers, custom agents, and skills — the same ones in this repo. You can run the full MCAPS toolkit from your shell without opening VS Code.

### Install Copilot CLI

```bash
# macOS
brew install copilot-cli

# or via npm
npm install -g @github/copilot
```

> Included in Copilot Free, Pro, Pro+, Business, and Enterprise subscriptions. See the [documentation](https://docs.github.com/copilot/concepts/agents/about-copilot-cli) for setup details.

### Prerequisites

- Azure CLI signed in (same as the VS Code flow — **VPN required**):
  ```bash
  az login
  ```
- Dependencies installed (`mcp/msx/` and optionally `mcp/oil/`)

### How it works with this repo

Copilot CLI automatically picks up the project's configuration when you run it from the repo root:

- **MCP servers** — reads `.vscode/mcp.json` and connects to the same `msx-crm`, `workiq`, and `oil` servers.
- **AGENTS.md** — loads the agent instructions from the repo root.
- **Skills & instructions** — loads `.github/skills/` and `.github/instructions/` the same way VS Code does, matching by keyword.

### Run it

```bash
cd mcaps-copilot-tools

# Start Copilot CLI — it will detect the MCP servers and agent config
copilot

# Then use slash commands inside the session:
#   /plan    — outline work before executing
#   /model   — switch between models
#   /fleet   — parallelize across subagents
#   /agent   — select a custom agent
#   /skills  — browse available skills
#   /resume  — pick up a previous session
```

### Example prompts (same as VS Code)

Once inside a Copilot CLI session, use the same natural language prompts:

```
Who am I in MSX?
Show me my active opportunities.
Run my weekly pipeline review — what needs cleanup across my Stage 2 and 3 opps?
How are my committed milestones doing?
```

Write operations still use the Stage → Review → Execute pattern and require your explicit approval.

### CLI ↔ IDE handoff

Copilot CLI supports seamless handoff to VS Code. Start with `/plan` in the terminal, then use the CLI-to-IDE flow to continue refining in your editor — or go the other direction.

> **Tip:** If you primarily work in the terminal, Copilot CLI gives you the same MCP tools, role-aware skills, and safety guardrails as the VS Code experience — just in your shell.

---

## Try It — Scenario Prompts

Copy-paste any of these into the Copilot chat window after you've started the MCP servers. Each prompt is designed to trigger one or more [atomic skills](#role-cards--atomic-skills) automatically — you don't need to name the skills, just describe what you need.

### Getting oriented

| What you want | Prompt to try |
|---|---|
| Check your CRM identity | `Who am I in MSX?` |
| See your active pipeline | `Show me my active opportunities.` |
| Understand what tools are available | `What MCP tools do I have available for MSX?` |

### By role

**Specialist**

| Scenario | Prompt |
|---|---|
| Qualify a new signal | `I got a signal from the Contoso account team about an Azure migration interest. Should I create an opportunity?` |
| Weekly pipeline review | `It's Monday — run my weekly pipeline review. What needs cleanup across my Stage 2 and 3 opps?` |
| Check handoff readiness | `The Fabrikam AI Copilot deal just got customer agreement. Is it ready to hand off to CSU?` |
| Plan a proof | `We need a POC plan for the Northwind opportunity. What should the proof cover and who owns what?` |

**Solution Engineer**

| Scenario | Prompt |
|---|---|
| Daily task hygiene | `Run my daily task hygiene check — any stale tasks or missing owners on my active milestones?` |
| Proof scoping | `The SE and Specialist need to align on success criteria for the Contoso pilot. Help us scope the proof plan.` |

**Cloud Solution Architect**

| Scenario | Prompt |
|---|---|
| Architecture feasibility | `Is the proposed architecture for the Cencora migration actually feasible? Check delivery dependencies and technical risk.` |
| Handoff to delivery | `The Contoso proof is complete. Create a handoff note summarizing architecture decisions, risks, and next actions for delivery.` |
| Execution sweep | `Run my weekly execution sweep — what's at risk across my committed milestones?` |
| Value realization | `We're entering Realize Value for the Northwind deal. Are our committed milestones tracking measurable outcomes?` |

**CSAM**

| Scenario | Prompt |
|---|---|
| Define outcomes | `I'm in Listen and Consult with a new engagement. Help me define measurable customer outcomes before we move to Stage 2.` |
| Commit gate | `The team wants to commit the Fabrikam migration milestone. Is it actually ready? Run the commit gate check.` |
| Milestone health | `How are my committed milestones doing? I have governance this week and need a health summary.` |
| Delivery ownership | `I keep getting tagged for delivery delays on the Vocera milestone but I'm not the delivery owner. Who actually owns execution here?` |
| Adoption review | `How is adoption going on the Contoso AI deployment? Check usage health and consumption targets.` |
| Evidence pack | `I have a QBR with Northwind next week. Prepare an evidence pack with CRM status and recent customer communications from the last 30 days.` |
| Expansion routing | `During the Fabrikam optimization review, the customer mentioned interest in expanding to a second region. Should this be a new opportunity?` |

**Any role**

| Scenario | Prompt |
|---|---|
| Stage identification | `What stage is the Contoso deal actually in? The CRM says Stage 3 but activity looks like Stage 2.` |
| Exit criteria | `Are we ready to advance to Stage 4 on the Northwind opportunity? Check exit criteria.` |
| Stage loopback | `The proof failed — customer environment wasn't ready. Should we loop back to Stage 2?` |
| Risk review | `What risks am I missing on the Cencora account? Do a full risk review.` |
| Role orchestration | `Three roles are involved on the Fabrikam deal and nobody's moving. Who should lead the next action?` |
| Authority tie-break | `The CSA and I are giving conflicting direction on the Vocera milestone. Who owns this decision?` |
| Partner motion | `The Contoso opportunity has a partner co-sell motion. How does that change ownership and delivery attribution?` |
| Unified constraints | `The milestone depends on Unified delivery. Are there dispatch or eligibility blockers I should know about?` |

### Multi-skill chain prompts (the good stuff)

These are realistic "day in the life" prompts that chain **multiple skills** in sequence. Use these to see the full orchestration in action:

> **Full weekly review (Specialist)**
>
> `I'm a Specialist. Run my full weekly review — pipeline hygiene, any deals ready to hand off, and flag risks across my active opps.`
>
> *Chains: pipeline-hygiene-triage → handoff-readiness-validation → risk-surfacing*

> **Pre-governance prep (CSAM)**
>
> `Before my Contoso governance meeting Thursday, tell me: what stage are we really in, what's the milestone health, and prepare a customer evidence pack for the last 30 days.`
>
> *Chains: mcem-stage-identification → milestone-health-review → customer-evidence-pack*

> **Commit-or-loopback decision (CSAM/CSA)**
>
> `The team wants to commit the Fabrikam milestone, but I heard the proof had issues. Check if we should commit or loop back, and tell me who owns what.`
>
> *Chains: commit-gate-enforcement → non-linear-progression → delivery-accountability-mapping*

> **End-to-end deal triage (Any role)**
>
> `The Northwind deal feels stuck. What stage is it actually in, are exit criteria met, what are the risks, and who should own the next action?`
>
> *Chains: mcem-stage-identification → exit-criteria-validation → risk-surfacing → role-orchestration*

> **Post-proof handoff (CSA → CSAM)**
>
> `I'm a CSA. The Contoso proof just completed successfully. Check architecture feasibility, create the handoff note, and validate that the Specialist handoff is clean.`
>
> *Chains: architecture-feasibility-check → architecture-execution-handoff → handoff-readiness-validation*

> **Adoption + expansion review (CSAM)**
>
> `Review adoption health for Fabrikam, check if value is being realized on committed milestones, and flag any expansion signals that should go to the Specialist.`
>
> *Chains: adoption-excellence-review → value-realization-pack → expansion-signal-routing*

> **Morning standup prep (SE)**
>
> `I'm an SE. Check my task hygiene, show me any execution blockers on committed milestones, and tell me if there are Unified constraints I should flag today.`
>
> *Chains: task-hygiene-flow → execution-monitoring → unified-constraint-check*

---

## Optional: Enable Obsidian Vault Integration

The **[Obsidian Intelligence Layer (OIL)](https://github.com/JinLee794/Obsidian-Intelligence-Layer)** turns your local Obsidian vault into a durable knowledge layer for AI agents. Instead of starting every conversation from scratch, OIL gives agents persistent memory — customer context, meeting history, relationship maps, and accumulated insights — all indexed and queryable through MCP tools.

OIL is included in this repo as a git subtree at `mcp/oil`.

### How to enable it

1. **Build OIL** (if you haven't already during setup):
   ```bash
   cd mcp/oil
   npm install
   npm run build
   ```

2. Open `.vscode/mcp.json` and uncomment the `"oil"` block:

```jsonc
"oil": {
    "type": "stdio",
    "command": "node",
    "args": ["mcp/oil/dist/index.js"],
    "env": {
        "OBSIDIAN_VAULT_PATH": "${input:obsidianVaultPath}"
    }
}
```

3. When prompted, enter the absolute path to your Obsidian vault (e.g., `/Users/yourname/Documents/MyVault`) — or set `OBSIDIAN_VAULT_PATH` as an environment variable.
4. Click **Start** on `oil` in VS Code just like the other servers.

OIL exposes **22 domain-specific tools** including `get_customer_context`, `search_vault`, `prepare_crm_prefetch`, `promote_findings`, `check_vault_health`, and more. See the [OIL README](mcp/oil/README.md) for the full tools reference.

> **Don't use Obsidian?** No worries — everything works without it. The system operates statelessly (CRM-only) and you can bring your own persistence layer if desired.

---

## Project Layout
![alt text](docs/assets/project-layout.png)
| Folder | What's inside | Editable? |
|---|---|---|
| `.github/copilot-instructions.md` | Global Copilot behavior — the "system prompt" | **Yes** — your main customization lever |
| `.github/instructions/` | Operational rules loaded by keyword match | **Yes** — add your team's workflow gates |
| `.github/skills/` | 27 atomic domain skills (loaded on demand by keyword match) | **Yes** — tailor to your operating model |
| `.github/prompts/` | Reusable prompt templates (slash commands) | **Yes** — create workflows you repeat often |
| `.vscode/mcp.json` | MCP server definitions (CRM, WorkIQ, Obsidian) | **Yes** — add/remove data sources |
| `mcp/msx/` | MSX CRM MCP server *(subtree: [microsoft/msx-copilot-mcp](https://github.com/microsoft/msx-copilot-mcp))* | Optional — works out of the box |
| `mcp/oil/` | Obsidian Intelligence Layer *(subtree: [JinLee794/Obsidian-Intelligence-Layer](https://github.com/JinLee794/Obsidian-Intelligence-Layer))* | Optional — enables persistent vault memory |
| `docs/` | Architecture docs and supporting material | Reference only |

> **Start here:** Open any file in `.github/` and read it. They're all plain Markdown. See the [Customization](#customization--make-it-yours) section for step-by-step examples.

## What's Included

<details>
<summary><strong>MSX CRM MCP Tools</strong> — read/write MSX opportunities, milestones, and tasks</summary>

These tools let Copilot interact with MSX CRM on your behalf:

| Tool | What it does |
|---|---|
| `crm_whoami` | Checks who you are in MSX (validates authentication) |
| `crm_query` | Runs read-only OData queries against CRM |
| `crm_get_record` | Fetches a specific CRM record by ID |
| `list_opportunities` | Lists opportunities, filterable by customer |
| `get_milestones` | Lists milestones for an opportunity or owner |
| `find_milestones_needing_tasks` | Finds milestones across customers that need task attention |
| `view_milestone_timeline` | Returns a timeline view of milestones |
| `view_opportunity_cost_trend` | Returns cost trend data for an opportunity |
| `create_task` | ⚠️ Creates a new task under a milestone *(write — staged)* |
| `update_task` / `close_task` | ⚠️ Updates or closes an existing task *(write — staged)* |
| `update_milestone` | ⚠️ Updates milestone status or details *(write — staged)* |

</details>

<details>
<summary><strong>Role Cards & Atomic Skills</strong> — 4 role cards + 27 domain skills, auto-loaded by keyword</summary>

The system uses **role cards** (identity and accountability rules) combined with **27 atomic skills** (focused domain playbooks). Role cards live in `.github/instructions/` and are loaded by keyword match; atomic skills live in `.github/skills/` and are loaded on demand.

**Role cards** (one per MCAPS role):

- **[Specialist](.github/instructions/role-card-specialist.instructions.md)** — pipeline creation, opportunity qualification, Stage 2-3 progression
- **[Solution Engineer](.github/instructions/role-card-se.instructions.md)** — technical proof, architecture reviews, task hygiene
- **[Cloud Solution Architect](.github/instructions/role-card-csa.instructions.md)** — execution readiness, architecture handoff, delivery ownership
- **[Customer Success Account Manager](.github/instructions/role-card-csam.instructions.md)** — milestone health, adoption, value realization, commit gates

**Atomic skills** (examples — see `.github/skills/` for all 27):

| Skill | What it does |
|---|---|
| `pipeline-qualification` | Qualifies new opportunities at Stages 1-2 |
| `milestone-health-review` | Reviews committed milestone health at Stages 4-5 |
| `proof-plan-orchestration` | Manages technical proof plans for SE |
| `risk-surfacing` | Proactively identifies deal/execution risks |
| `handoff-readiness-validation` | Validates handoff quality between roles |
| `workiq-query-scoping` | Scopes M365 searches for effective retrieval |

You don't need to memorize these — just tell Copilot your role and it will load the right card and activate relevant skills automatically.

</details>

<details>
<summary><strong>WorkIQ (M365 Evidence Retrieval)</strong> — search Teams, Outlook, Meetings, and SharePoint</summary>

WorkIQ connects Copilot to your Microsoft 365 data. It can search across:

- **Teams** — chat/thread decisions, channel updates, action ownership
- **Meetings** — transcript evidence, decisions, blockers, next steps
- **Outlook** — stakeholder communication trail, commitments, follow-ups
- **SharePoint/OneDrive** — latest proposal/design docs and revision context

Learn more: [WorkIQ overview (Microsoft Learn)](https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/workiq-overview)

</details>

<details>
<summary><strong>OIL — Obsidian Intelligence Layer</strong> — persistent knowledge graph from your local Obsidian vault (optional)</summary>

[OIL](mcp/oil/README.md) turns your local [Obsidian](https://obsidian.md/) vault into a durable, queryable knowledge layer for the agent. Without it, the system works — but statelessly. With it, Copilot gains **persistent memory** across sessions: customer context, meeting history, relationship maps, and accumulated insights.

**Why Obsidian?**
- **100% local** — your notes never leave your machine. No cloud sync required.
- **Graph-based** — Obsidian's wikilink model gives OIL a pre-built relationship graph (people ↔ customers ↔ meetings ↔ projects) queryable in O(1) via a pre-indexed backlink map.
- **Markdown-native** — plain `.md` files you own forever. No proprietary format, no vendor lock-in.
- **Works offline** — Obsidian doesn't even need to be running. OIL reads the vault folder directly.

**What OIL provides (22 tools):**

| Category | Tools | Purpose |
|---|---|---|
| **Orient** | `get_vault_context`, `get_customer_context`, `get_person_context`, `query_graph`, `resolve_people_to_customers` | Understand who/what/where before querying CRM |
| **Retrieve** | `search_vault`, `query_notes`, `find_similar_notes` | 3-tier search: lexical → fuzzy → semantic embeddings |
| **Write** | `patch_note`, `capture_connect_hook`, `draft_meeting_note`, `update_customer_file`, `create_customer_file`, + more | Gated writes with diffs and human confirmation |
| **Composite** | `prepare_crm_prefetch`, `correlate_with_vault`, `promote_findings`, `check_vault_health`, `get_drift_report` | Cross-MCP workflows that bridge vault ↔ CRM ↔ M365 |

**Setting up your own vault:**

1. **Create a vault** — Open [Obsidian](https://obsidian.md/) and create a new vault (or point to an existing folder of Markdown files).

2. **Add the folder structure OIL expects** — at minimum:
   ```
   YourVault/
   ├── Customers/       # One .md per customer (e.g., Contoso.md)
   ├── People/          # One .md per contact (e.g., Alice Smith.md)
   ├── Meetings/        # Meeting notes with wikilinks to customers/people
   └── oil.config.yaml  # Optional — customize folder paths and field names
   ```
   See [bench/fixtures/vault/](mcp/oil/bench/fixtures/vault/) for example files you can copy as templates.

3. **Build and configure OIL:**
   ```bash
   cd mcp/oil && npm install && npm run build && cd ../..
   ```

4. **Enable in `.vscode/mcp.json`** — uncomment the `oil` block and set your vault path:
   ```jsonc
   "oil": {
       "type": "stdio",
       "command": "node",
       "args": ["mcp/oil/dist/index.js"],
       "env": {
           "OBSIDIAN_VAULT_PATH": "/absolute/path/to/YourVault"
       }
   }
   ```

5. Click **Start** on `oil` in VS Code — the agent now has persistent memory.

> **Don't use Obsidian?** Everything works without it. You can also bring any MCP-compatible note server — just wire it into `.vscode/mcp.json`.

See the full [OIL README](mcp/oil/README.md) for configuration options, tool details, and architecture.

</details>

---

## Write Operations & Responsible AI Use

> **CRM is shared production data.** Incorrect writes can affect your entire account team and customer-facing records. Use AI-assisted write operations responsibly.

### Current status: writes are experimental

The write tools (`create_task`, `update_task`, `close_task`, `update_milestone`) are included in the MCP server but should be treated as **experimental**. They are designed with safety guardrails, but you should understand the risks before relying on them.

### How write safety works

All write operations use a **Stage → Review → Execute** pattern (see [STAGED_OPERATIONS.md](mcp/msx/STAGED_OPERATIONS.md) for technical details):

1. **Stage** — When you ask Copilot to create/update/close a record, the change is validated and staged locally. **Nothing is written to CRM yet.**
2. **Review** — Copilot shows you a before/after diff of the proposed change and asks for your approval.
3. **Execute** — Only after you explicitly approve does the change get sent to CRM. You can cancel at any time.

Staged operations expire automatically after 10 minutes if not acted on.

### Responsible AI guidelines

- **Always review before approving.** Read the staged diff carefully. Verify field values, dates, and record IDs.
- **Don't batch-approve blindly.** If Copilot stages multiple operations, review each one. Use `cancel_operation` to discard any you're unsure about.
- **Verify the right record.** CRM GUIDs can look similar. Confirm the opportunity/milestone name matches what you expect.
- **Start with reads.** Before writing, use read tools (`crm_query`, `get_milestones`) to confirm the current state of the record.
- **You are accountable.** AI suggests changes, but you own the approval. Treat every write approval as if you were making the change manually in MSX.

---

## How It Works (Under the Hood)

![alt text](docs/assets/how-it-works.png)

```
You (Copilot Chat)
  │
  ├── asks about CRM data  ──→ msx-crm MCP server ──→ MSX Dynamics 365
  ├── asks about M365 data ──→ workiq MCP server  ──→ Teams / Outlook / SharePoint
  └── asks about notes     ──→ OIL (optional)     ──→ Your Obsidian Vault
```

1. You type a question or action in Copilot chat.
2. Copilot reads the role skills and instruction files in this repo to understand how to behave.
3. It routes your request to the right MCP server (CRM, WorkIQ, or Obsidian).
4. For read operations, it returns the results directly.
5. For write operations, it shows you what it plans to change and waits for your approval.

---

## Configuration

### Authentication

All CRM operations authenticate through Azure CLI. You must be **connected to the Microsoft corporate VPN** and use your **Microsoft corp account**:

```bash
az login
```

Make sure you're on VPN and signed in with your Microsoft corp account (e.g., `your-alias@microsoft.com`) before starting the MCP servers.

### MCP Server Config

The file [.vscode/mcp.json](.vscode/mcp.json) defines which MCP servers are available to Copilot. Each server exposes tools that Copilot can call on your behalf. Out of the box, it includes:

| Server | Status | Purpose | Tools It Provides |
|---|---|---|---|
| `msx-crm` | **Enabled** | MSX CRM operations | `crm_whoami`, `crm_query`, `list_opportunities`, `get_milestones`, `create_task`, etc. |
| `workiq` | **Enabled** | Microsoft 365 evidence retrieval | `ask_work_iq` (Teams, Outlook, SharePoint) |
| `oil` | Commented out | Obsidian Intelligence Layer | `get_customer_context`, `search_vault`, `prepare_crm_prefetch`, `promote_findings`, etc. |

You can add any MCP-compatible server to this file. See the [Customization](#customization--make-it-yours) section for examples.

## Customization — Make It Yours

This repo is designed to be forked and tailored. The `.github/` directory is where all of Copilot's behavior is defined — in plain Markdown files you can edit directly. No code changes required.

> **Think of `.github/` as your team's operating manual for Copilot.**
> Every file in it shapes what Copilot knows, how it reasons, and what it says. Edit freely — you can't break CRM by editing a Markdown file.

### How GitHub Copilot Custom Instructions Work

GitHub Copilot looks for special files in your repo's `.github/` folder and loads them automatically:

| File / Folder | What Copilot Does With It |
|---|---|
| `.github/copilot-instructions.md` | **Always loaded.** The "system prompt" — top-level rules Copilot follows on every turn. |
| `.github/instructions/*.instructions.md` | **Loaded when relevant.** Each file has a `description` in its YAML frontmatter. Copilot loads it when your request matches those keywords. |
| `.github/skills/*/SKILL.md` | **Loaded on demand.** Deep role/domain playbooks. Copilot picks the right one based on `name` and `description` in frontmatter. |
| `.github/prompts/*.prompt.md` | **Reusable prompt templates.** Appear in Copilot's slash-command menu (`/`) so you can trigger complex workflows with one click. |

You don't need to register these files anywhere — just create or edit them and Copilot picks them up automatically.

### What's in `.github/` Right Now

Here's what ships out of the box and what each piece does:

```
.github/
├── copilot-instructions.md          ← Global behavior: MCP routing, role detection, response style
├── instructions/
│   ├── intent.instructions.md       ← "Why does this agent exist?" — strategic intent
│   ├── mcem-flow.instructions.md    ← MCEM process model, stages, exit criteria
│   ├── shared-patterns.instructions.md ← Shared definitions and runtime contract
│   ├── role-card-specialist.instructions.md  ← Specialist identity + accountability
│   ├── role-card-se.instructions.md          ← Solution Engineer identity + accountability
│   ├── role-card-csa.instructions.md         ← Cloud Solution Architect identity + accountability
│   ├── role-card-csam.instructions.md        ← CSAM identity + accountability
│   ├── msx-role-and-write-gate.instructions.md ← Confirmation gates before any CRM write
│   ├── crm-entity-schema.instructions.md     ← CRM field names so Copilot builds correct queries
│   ├── crm-query-strategy.instructions.md    ← CRM read query scoping strategy
│   ├── connect-hooks.instructions.md         ← Evidence capture for Connect impact reporting
│   └── obsidian-vault.instructions.md        ← Vault integration conventions
├── skills/                          ← 27 atomic domain skills (loaded on demand)
│   ├── pipeline-qualification/SKILL.md       ← Qualify new opportunities (Stages 1-2)
│   ├── milestone-health-review/SKILL.md      ← Committed milestone health (Stages 4-5)
│   ├── proof-plan-orchestration/SKILL.md     ← Technical proof management
│   ├── risk-surfacing/SKILL.md               ← Proactive risk identification
│   ├── handoff-readiness-validation/SKILL.md ← Cross-role handoff quality
│   ├── mcem-stage-identification/SKILL.md    ← Identify current MCEM stage
│   ├── workiq-query-scoping/SKILL.md         ← Scope M365 searches effectively
│   ├── skill-authoring-best-practices/SKILL.md ← Guide for writing your own skills
│   ├── ... (19 more atomic skills)           ← See directory for full list
│   └── _legacy/                              ← Archived monolithic role skills (reference only)
├── prompts/
│   ├── prepare-meeting.prompt.md    ← Pre-populate meeting notes from vault + CRM
│   ├── process-meeting-notes.prompt.md ← Structure raw notes into formatted vault entries
│   ├── weekly-digest.prompt.md      ← Weekly summary across customers + CRM
│   ├── project-status.prompt.md     ← Project status from vault + CRM validation
│   ├── create-person.prompt.md      ← Create a People note from meeting context
│   └── sync-project-from-github.prompt.md ← Pull GitHub activity into vault
└── documents/                       ← Reference docs (never auto-loaded, read on demand)
```

### Quick Customization Examples

#### 1. Change how Copilot talks to you

Edit `.github/copilot-instructions.md` — this is the master prompt. For example, to make responses more concise:

```markdown
## Response Expectations

- Keep outputs concise and action-oriented.
- Use bullet points, not paragraphs.
- Lead with the answer, then context.
```

#### 2. Add your team's workflow rules

Create a new file in `.github/instructions/` with a descriptive YAML header. Copilot will load it whenever your request matches the `description` keywords.

**Example:** `.github/instructions/deal-review-checklist.instructions.md`

```markdown
---
description: "Deal review checklist and qualification gates. Use when preparing for deal reviews, pipeline calls, or qualification discussions."
---

# Deal Review Checklist

Before any deal review, verify:
- [ ] Customer pain confirmed in their own words
- [ ] Technical win plan documented (or N/A for renewals)
- [ ] Competitor landscape noted
- [ ] Next steps have owners and dates
```

#### 3. Customize role cards or atomic skills

**Role cards** (in `.github/instructions/`) define each role's identity, accountability, and boundaries. **Atomic skills** (in `.github/skills/`) define focused domain playbooks. Each has YAML frontmatter that controls when it activates.

Skill frontmatter:

```yaml
---
name: milestone-health-review
description: 'Reviews committed milestone health for CSAM at MCEM Stages 4-5...'
argument-hint: 'Provide opportunityId(s) or run across all CSAM-owned committed milestones'
---
```

- `name` — internal identifier
- `description` — **the trigger**: Copilot matches this against your request to decide whether to load the skill. Make it keyword-rich.
- `argument-hint` — tells Copilot what inputs to ask for

Role card frontmatter (instructions):

```yaml
---
description: "Specialist (STU) role identity card. Mission, MCEM stage accountability..."
---
```

**Tip:** You can duplicate a skill and create a variation for a sub-team (e.g., a `milestone-health-review-fasttrack/SKILL.md` with FastTrack-specific patterns).

#### 4. Create reusable prompt templates

Files in `.github/prompts/` appear as slash commands in Copilot chat. Create one for any multi-step workflow you repeat often.

**Example:** `.github/prompts/quarterly-review-prep.prompt.md`

```markdown
---
description: "Prepare a quarterly business review deck by pulling CRM pipeline data, milestone status, and customer health signals."
---

# Quarterly Review Prep

## Workflow

1. Use `list_opportunities` for {customer} — get all active opportunities.
2. Use `get_milestones` for each opportunity — summarize status and blockers.
3. Use `ask_work_iq` — find recent executive emails or meeting decisions.
4. Format as a QBR summary: pipeline, delivery, risks, asks.
```

After saving, type `/` in Copilot chat to see it in the menu.

#### 5. Add a new MCP server

> [!CAUTION]
> **This workspace handles live MSX sales data — customer names, deal values, pipeline status, internal stakeholders, and engagement history. Treat every MCP server you connect as having full visibility into that data.**
>
> **Before adding any MCP server, verify ALL of the following:**
>
> - **Runs locally.** Prefer servers that execute entirely on your machine via `stdio` (like `msx-crm` and `workiq` in this repo). A local process never sends your data to a third party.
> - **No network-facing servers.** Do NOT expose MCP servers over HTTP/SSE to the network. A network-listening MCP server is an open door to your CRM data for anyone who can reach the port.
> - **Trusted source only.** Only install MCP servers from publishers you trust — your own org, Microsoft, or packages you have personally reviewed. Random community servers can exfiltrate data, inject prompts, or modify CRM records.
> - **Review what it does.** Before running `npx some-unknown-package`, read its source or README. Understand what tools it registers and what data it accesses.
> - **No secrets in plain text.** Never hardcode API keys, tokens, or credentials in `mcp.json`. Use `${input:...}` prompts or environment variables instead.
> - **Principle of least privilege.** Only connect servers that need access to what you're working on. Don't add a server "just in case."
>
> **If you wouldn't paste your pipeline data into a random website, don't pipe it through a random MCP server.**

Edit `.vscode/mcp.json` to connect additional data sources. Each server gets its own tools that Copilot can call.

```jsonc
{
  "servers": {
    // Existing servers...

    "my-custom-server": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@my-org/my-mcp-server"],
      "env": {
        "API_KEY": "${input:myApiKey}"
      }
    }
  }
}
```

Browse the [MCP Server Registry](https://github.com/modelcontextprotocol/servers) for community servers, or build your own following the [MCP spec](https://spec.modelcontextprotocol.io/). **Always vet servers against the security checklist above before connecting them.**

### The Context Loading Model

Understanding the loading tiers helps you decide where to put new content:

| Tier | Location | When Copilot Loads It | Best For |
|---|---|---|---|
| **Tier 0** | `copilot-instructions.md` | Every single turn | Global rules, routing, response style (~80 lines max) |
| **Tier 1** | `instructions/*.instructions.md` | When request matches `description` keywords | Operational contracts, workflow gates, schemas |
| **Tier 2** | `skills/*/SKILL.md` | When request matches `name`/`description` | Deep role playbooks, domain expertise |
| **Tier 3** | `documents/` | Only when explicitly read via tool call | Large reference material, specs, protocol docs |

**Rule of thumb:** Put universals in Tier 0, conditionals in Tier 1, role-specific depth in Tier 2, and bulky references in Tier 3.

---

## Frequently Asked Questions

**Do I need to know how to code?**
No. The primary interface is the Copilot chat window — you type in plain English and Copilot does the rest. The code in this repo powers the tools behind the scenes.

**Is it safe to use? Will it change my CRM data without asking?**
No write operation happens without your explicit approval. Every create, update, or close action shows you a confirmation prompt first.

**What if I don't have an Obsidian vault?**
Everything works fine without it. Obsidian integration is entirely optional.

**Can I use this outside VS Code?**
Yes — [GitHub Copilot CLI](https://github.com/features/copilot/cli/) is a fully supported alternative that runs the same MCP tools, agents, and skills directly in your terminal. Install with `brew install copilot-cli` and run from the repo root. See [Alternative: Use with GitHub Copilot CLI](#alternative-use-with-github-copilot-cli) for details. The MCP servers also work with any other MCP-compatible client.

**How do I write a good skill or instruction file?**
See [skill-authoring-best-practices/SKILL.md](.github/skills/skill-authoring-best-practices/SKILL.md) for a full checklist. The short version: keep the `description` keyword-rich so Copilot finds it, structure the body as a step-by-step workflow, and don't exceed ~150 lines per file.

**I edited a file in `.github/` but Copilot doesn't seem to use it.**
Check the `description` field in the YAML frontmatter — Copilot matches against those keywords. If the description doesn't overlap with how you phrase your request, it won't load. Try adding more trigger phrases to the description.

**What if `az login` fails or my token expires?**
Run `az login` again. The MCP server uses Azure CLI tokens, so keeping your session active is all you need.

---

Big thanks to the original microsoft/MSX-Helper project for the foundation and inspiration that helped shape this into an MCP server.

## License

MIT (see `mcp/msx/package.json`)
