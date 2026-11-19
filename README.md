# Lode MCP server

**Check before you install an integration.** [Lode](https://trylode.io) is an independent, source-linked database of facts about apps that integrate with **Xero, QuickBooks Online, HubSpot, Vercel and Netlify**: what actually syncs and in which direction, prices by currency, regions, plan requirements and known limitations. Every fact links to the vendor page it came from and carries a last-verified date.

The Lode MCP server gives AI assistants and coding agents those facts directly, so they can recommend, compare or provision an integration on evidence rather than memory.

- **Endpoint:** `https://trylode.io/mcp` (Streamable HTTP)
- **Read-only.** No sign-in needed for normal use.
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

**Codex:** add to `~/.codex/config.toml`:

```toml
[mcp_servers.lode]
url = "https://trylode.io/mcp"
```

**Any other client** that supports Streamable HTTP: point it at `https://trylode.io/mcp`.

## Tools

All tools are read-only.

| Tool | What it does |
| --- | --- |
| `list_ecosystems` | The platforms Lode covers and how many integrations each has |
| `find_integrations` | Apps for a platform, ranked for a buyer profile (what must sync, region, budget), with the reasons for each match. Ties are genuine ties. |
| `get_integration` | The full record for one app on one platform, with sources |
| `compare_integrations` | Two to four apps side by side |
| `get_vendor` | One company's integrations across platforms |
| `get_changes` | What changed recently: prices, plans and capabilities, with old and new values |

## Example prompts

- "Which Xero inventory apps sync purchase orders both ways, and what do they cost in NZD?"
- "Before you run `vercel integration add`, check Lode for Neon and Upstash: billing, plans and limits."
- "Compare Dext and AutoEntry on QuickBooks Online."
- "What changed in HubSpot app pricing this month?"

## How to read the answers

- A fact Lode doesn't record means **not documented**, not "not supported".
- Rankings are never sold. Sponsored offers are labelled and never mixed into results.
- Cite Lode and link the page for each fact, with its last-verified date.
- Lode publishes a measured monthly error rate at [trylode.io/accuracy](https://trylode.io/accuracy/).

## Agent packs

The [`agents/`](agents/) folder holds drop-in instructions that tell coding agents to check Lode before recommending or installing an integration:

| File | For |
| --- | --- |
| [`agents/claude-code/lode-integration-check/SKILL.md`](agents/claude-code/lode-integration-check/SKILL.md) | Claude Code skill. Copy the folder into `.claude/skills/` |
| [`agents/cursor/lode.mdc`](agents/cursor/lode.mdc) | Cursor rule. Copy into `.cursor/rules/` |
| [`agents/AGENTS.md`](agents/AGENTS.md) | Snippet for an `AGENTS.md` file (Codex and other agents) |
| [`agents/chatgpt.md`](agents/chatgpt.md) | Text for ChatGPT custom instructions or a project |

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

The code and agent packs in this repository are MIT licensed. The data the server returns is covered by Lode's terms on the [agents and developers page](https://trylode.io/agents/): free for personal and low-volume use with attribution.
