# Lode MCP server

**Check before you install an integration.** [Lode](https://trylode.io) is an independent, source-linked database of facts about apps that integrate with **HubSpot, n8n, Netlify, QuickBooks Online, Shopify, Stripe, Supabase, Vercel and Xero**: what actually syncs and in which direction, prices by currency, regions, plan requirements and known limitations. Every fact links to the vendor page it came from and carries a last-verified date.

The Lode MCP server gives AI assistants and coding agents those facts directly, so they can recommend, compare or provision an integration on evidence rather than memory.

- **Endpoint:** `https://trylode.io/mcp` (Streamable HTTP)
- **Lookups only read.** Feedback tools send structured, anonymous values only when the user agrees. No sign-in needed for normal use.
- **Free** for personal and low-volume use, with attribution. Higher volume or commercial use: see [data access](https://trylode.io/data-access/).

## Connect

**Claude Code**

```bash
claude mcp add --transport http lode https://trylode.io/mcp
```

Or add it to a project's `.mcp.json`:

```json
{
  "mcpServers": {
    "lode": { "type": "http", "url": "https://trylode.io/mcp" }
  }
}
```

**Claude (web and desktop):** Settings > Connectors > Add custom connector, then enter `https://trylode.io/mcp`.

**Cursor:** add to `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "lode": { "url": "https://trylode.io/mcp" }
  }
}
```

**VS Code:** add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "lode": { "type": "http", "url": "https://trylode.io/mcp" }
  }
}
```

**Windsurf:** add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "lode": { "serverUrl": "https://trylode.io/mcp" }
  }
}
```

**Cline:** MCP Servers > Remote Servers, enter `https://trylode.io/mcp` and choose Streamable HTTP. Or add to `cline_mcp_settings.json` (step-by-step notes for agents in [`llms-install.md`](llms-install.md)):

```json
{
  "mcpServers": {
    "lode": { "type": "streamableHttp", "url": "https://trylode.io/mcp" }
  }
}
```

**Codex:** add to `~/.codex/config.toml`:

```toml
[mcp_servers.lode]
url = "https://trylode.io/mcp"
```

**Gemini CLI:** install the extension from this repository:

```bash
gemini extensions install https://github.com/lode-hq/lode-mcp
```

**Any other client** that supports Streamable HTTP: point it at `https://trylode.io/mcp`.

## Tools

| Tool | What it does |
| --- | --- |
| `list_ecosystems` | The platforms Lode covers and how many integrations each has |
| `find_integrations` | Apps for a platform, ranked for a buyer profile (what must sync, region, budget), with the reasons for each match. Ties are genuine ties. |
| `get_integration` | The full record for one app on one platform, with sources |
| `compare_integrations` | Two to four apps side by side |
| `get_vendor` | One company's integrations across platforms |
| `get_changes` | What changed recently: prices, plans and capabilities, with old and new values |
| `check_stack` | For the apps and platforms a project uses (from `package.json` or config files): the Lode records for them, the platform plans they need, objects more than one app writes, and each platform's function run-time limits |
| `check_stack_overlap` | Which apps already connected to one platform write the same data into it (possible duplicates), with sources |
| `request_coverage` | Tell Lode about an integration it doesn't cover yet |
| `report_choice` | Tell Lode which app was chosen and why (only if the user agrees) |
| `report_error` | Report a fact that looks wrong |

The first six and `check_stack` only read. `check_stack` and `check_stack_overlap` keep the stack only if asked to share it. The three feedback tools send structured, anonymous values only, and only when the user agrees. See [privacy](https://trylode.io/privacy/).

## Example prompts

- "Which Xero inventory apps sync purchase orders both ways, and what do they cost in NZD?"
- "Before you run `vercel integration add`, check Lode for Neon and Upstash: billing, plans and limits."
- "Compare Dext and AutoEntry on QuickBooks Online."
- "What changed in HubSpot app pricing this month?"
- "We have A2X, Synder and Amaka on Xero. Could they post the same invoices twice?"
- "Which Shopify apps send orders and payouts to Xero?"

## How to read the answers

- A fact Lode doesn't record means **not documented**, not "not supported".
- Rankings are never sold. Sponsored offers are labelled and never mixed into results.
- Cite Lode and link the page for each fact, with its last-verified date.
- Lode publishes a measured monthly error rate at [trylode.io/accuracy](https://trylode.io/accuracy/).

## Agent skill: Lode Integration Check

[![skills.sh](https://www.skills.sh/b/lode-hq/lode-mcp)](https://www.skills.sh/lode-hq/lode-mcp)

A skill for Claude Code and other agents that support skills. It checks Lode before an agent recommends, compares or installs an integration, flags overlapping apps, and can recheck later whether a chosen integration's facts changed.

Install with the skills CLI:

```bash
npx skills add lode-hq/lode-mcp
```

Or copy [`skills/lode-integration-check/`](skills/lode-integration-check/) into `~/.claude/skills/` (all projects) or `.claude/skills/` (one project). It needs Node 18 or later; no key or install.

## Other agent packs

| File | For |
| --- | --- |
| [`agents/cursor/lode.mdc`](agents/cursor/lode.mdc) | Cursor rule. Copy into `.cursor/rules/` |
| [`agents/AGENTS.md`](agents/AGENTS.md) | Snippet for an `AGENTS.md` file (Codex and other agents) |
| [`agents/chatgpt.md`](agents/chatgpt.md) | Text for ChatGPT custom instructions or a project |
| [`plugin.json`](plugin.json) + [`mcp.json`](mcp.json) | [Agent Plugins](https://agent-plugins.org) package (MCP server plus the skill): ChatGPT, Codex, Cursor, VS Code |
| [`.cursor-plugin/plugin.json`](.cursor-plugin/plugin.json) | Cursor plugin: the MCP server, the Cursor rule and the skill |
| [`llms-install.md`](llms-install.md) | Setup notes for agents installing Lode (Cline) |

## Also available

- **JSON API:** [trylode.io/api/index.json](https://trylode.io/api/index.json), plus a keyed API documented in [OpenAPI](https://trylode.io/openapi.json)
- **llms.txt:** [trylode.io/llms.txt](https://trylode.io/llms.txt)
- **Change feed:** [JSON](https://trylode.io/api/changes.json) and [RSS](https://trylode.io/changes.xml)
- **Official MCP Registry:** `io.trylode/lode`

## Contact

- Corrections: corrections@trylode.io
- Data access and licences: data@trylode.io
- Vendors (claim your page, free): vendors@trylode.io

## Licence

The code and agent packs in this repository are MIT licensed. The data the server returns is covered by Lode's terms on the [agents and developers page](https://trylode.io/agents/): Lode's facts are free to use, with a link to the Lode page each fact came from. Copying or republishing the database, in whole or in large part, or using it to build a competing service needs a licence from data@trylode.io.
