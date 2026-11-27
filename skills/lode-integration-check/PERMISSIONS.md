# What the Lode Integration Check skill reads, sends and keeps

The skill is one script (`scripts/lode.mjs`) with no dependencies and no install scripts. It talks only to
`https://trylode.io`. Nothing is sent without a command you run, and the optional sharing flag `--share` is
added only after the user agrees. Lode never receives error messages, logs, code, prompts, file contents or
secrets. Privacy policy: https://trylode.io/privacy/

| Command | Reads on your machine | Sends to Lode | Writes on your machine |
|---|---|---|---|
| `check`, `list`, `platforms`, `find` | nothing | the app, platform and the options you pass (needs, region, stack names, framework) | nothing |
| `request` | nothing | the app, platform, needs and region | nothing |
| `chose`, `outcome` | nothing | only with `--share`: the chosen and considered apps, fixed codes, needs and region | `chose`: `lode-integrations.json` |
| `overlap` | nothing | the apps' record ids it reads; with `--share`: platform, app list, region | nothing |
| `recheck`, `drop` | `lode-integrations.json` | with `--share`: random project code, Lode ids, states, reason codes, days since chosen | `lode-integrations.json`, a matching ADR |
| `adr` | `lode-integrations.json`, the ADR it updates | with `--share`: project code, platform, Lode ids, fixed codes, days | `docs/adr/NNN-<platform>-<app>.md` |
| `stack` | `package.json`, `requirements.txt`, `pyproject.toml`, `Gemfile`, `go.mod`, variable NAMES in `.env.example`, `vercel.json`, `netlify.toml`, `supabase/config.toml` | with `--share`: the app and platform codes found, the framework | nothing |
| `triage` | nothing | the app, platform, one fixed symptom code, the HTTP status if given (only its class is kept) and the `--object` code if given; with `--share`: the outcome code and the `--switched-to` app | nothing |
| `init` | `.mcp.json`, `.cursor/mcp.json`, `.claude/lode-init.json` | nothing | only with `--yes`, only inside a project folder and never through links: one `lode` entry in those files, a copy of this skill in `.claude/skills/` and a note of what was added in `.claude/lode-init.json`; a file it can't parse is left alone; `init --remove --yes` undoes only what init added |

Connect the MCP server at `https://trylode.io/mcp?log=0` to keep Lode from logging your requests (only the daily
rate-limit count and anything you choose to send are kept).
