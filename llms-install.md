# Installing the Lode MCP server

Lode is a **hosted** MCP server. There is nothing to clone, build or install, and no API key is needed for normal use.

- **Endpoint:** `https://trylode.io/mcp`
- **Transport:** Streamable HTTP
- **Authentication:** none

## Cline

Add this entry to `cline_mcp_settings.json` (Cline > MCP Servers > Configure MCP Servers), merging it with any servers already there:

```json
{
  "mcpServers": {
    "lode": {
      "type": "streamableHttp",
      "url": "https://trylode.io/mcp",
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Save the file. Cline connects straight away; Lode should show as connected with 11 tools.

## Check it works

Ask: "Use Lode to list the platforms it covers." Cline should call `list_ecosystems` and return Cloudflare, Cursor, GitHub, HubSpot, LangChain, Linear, Lovable, n8n, Netlify, QuickBooks Online, Replit, Shopify, Stripe, Supabase, Vercel and Xero.

## Notes for the agent

- Leave `autoApprove` empty unless the user asks otherwise. Six lookup tools and `check_stack` only read; `request_coverage`, `report_choice`, `report_error`, and `share: true` on the stack checks send short anonymous reports to Lode, so use them only when the user agrees.
- Free for personal and low-volume use (about 300 requests a day without a key). Higher volume: an optional key goes in an `Authorization: Bearer` header; see https://trylode.io/data-access/.
- If the connection fails, check `https://trylode.io/v1/health` and retry; do not install any package.
