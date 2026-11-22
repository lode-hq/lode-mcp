# Trigger test (before going public)

Purpose: check that coding agents actually load this skill when they should, and leave it alone when
they shouldn't. Takes about 20 minutes in Claude Code (repeat in Codex or Cursor if available).

## Set up

Copy the `lode-integration-check` folder into `~/.claude/skills/` (or a test project's
`.claude/skills/`). Start a fresh session for each prompt.

## Should use the skill (6)

1. We run Shopify and Xero. Set up the sync so orders and payouts land in Xero.
2. Which Xero inventory app can sync purchase orders? We're in New Zealand.
3. Add authentication to my Next.js app on Supabase. I'd rather not build it myself.
4. Does Clerk work with Supabase row level security?
5. I want Stripe payouts to reconcile in QuickBooks Online. What should I use?
6. Add a Postgres database to this Vercel project through the marketplace.

## Should use the skill: overlap (LOD-93, 1; scored separately)

11. We have A2X, Synder and Amaka all connected to Xero. Could they be posting the same invoices twice?

Pass: the agent runs `scripts/lode.mjs overlap xero --apps "A2X,Synder,Amaka"`, reports the facts with
sources, gives no advice to switch an app off, and asks before adding `--share`.

## Should not use the skill (4)

7. Fix the TypeScript error in src/app/page.tsx.
8. How do I paginate a Supabase query in JavaScript?
9. Write a SQL migration that adds an orders table.
10. Explain what a webhook is.

## Score

For each prompt, note: did the agent load the skill (yes or no), and did it run `scripts/lode.mjs`?

- Pass: at least 5 of 6 in the first group, and at most 1 of 4 in the second.
- Fail: rework the description in SKILL.md (it is the only thing agents read before deciding), then
  rerun. Record each run's results in LOD-90.
