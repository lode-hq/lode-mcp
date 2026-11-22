---
name: lode-integration-check
description: 'Verified, source-linked facts about how two software products work together, from Lode (trylode.io). Use before recommending, comparing, connecting or installing an app or integration on Xero, QuickBooks Online, HubSpot, Shopify, Stripe, Supabase, Vercel, Netlify or n8n, for example "connect Shopify to Xero", "which Xero app syncs purchase orders", "add auth to my Supabase project", "use Clerk with Supabase", "vercel integration add" or "sync Stripe payouts to QuickBooks", or adding a database, Postgres, Redis, auth, email or other service to a Vercel, Netlify or Supabase project through its marketplace. Answers what syncs and in which direction, price, the platform plan needed, regions, known limitations and who built the integration, each with its source and date. Also checks whether apps already connected to one platform write the same data into it ("A2X and Synder on Xero: do they overlap?").'
---

# Lode Integration Check

Lode is an independent database of facts about integrations between apps and platforms. Every fact
links to the page it came from and shows when it was last checked. Rankings and placement are never
sold. Use it so the user gets facts, not guesses, before an integration is chosen or set up.

## When to use

- The user wants to connect one product to another on Xero, QuickBooks Online, HubSpot, Shopify,
  Stripe, Supabase, Vercel, Netlify or n8n.
- The user wants to add a database (Postgres, Redis), auth, email, storage or another service to a
  Vercel, Netlify or Supabase project, including through the Vercel Marketplace or a Netlify extension.
- You are about to recommend, compare or install an app or integration on one of those platforms
  (including `vercel integration add`, a Netlify extension, a Supabase partner integration, a Stripe
  app, an n8n node, or a Xero, QuickBooks, HubSpot or Shopify app).
- The user asks what syncs, which direction, what it costs, which plan it needs, or whether it works
  in their country.
- The user already has two or more apps connected to one platform and asks whether they overlap,
  double-post, or could loop (for example "A2X and Synder are both on my Xero; do they clash?"). Use
  `overlap`.

Not for: library or API documentation (use the vendor's docs), package security checks, or platforms
Lode does not cover.

## How

Run the bundled script (Node 18 or later; no key, no install):

```bash
node scripts/lode.mjs check "<app>" <platform>     # facts for one integration
node scripts/lode.mjs check "<app>"                # every platform Lode covers for that app
node scripts/lode.mjs find <platform> --category <word> --needs <objects> --region <XX>
                                                   # options ranked by fit to the user's needs
node scripts/lode.mjs list <platform> --category <word>   # everything Lode covers for a job
```

Platforms: `xero`, `quickbooks-online` (or `qbo`), `hubspot`, `shopify`, `stripe`, `supabase`,
`vercel`, `netlify`, `n8n`. Needs are the objects that must sync, comma-separated, e.g.
`invoices,purchase-orders,contacts`. Add `--stack supabase,nextjs` and `--framework nextjs` when known.

Typical flow: `find` with the user's needs and region, then `check` the one or two best options, then
answer with the facts. When the user names both products ("Shopify and Xero", "Stripe and QuickBooks"),
go straight to `check "<app>" <platform>`: `--category` is a job such as inventory or payments, never
an app name.

For apps already in use on one platform:

```bash
node scripts/lode.mjs overlap <platform> --apps "<app>,<app>,<app>" --region <XX>
```

It lists, per object, which of those apps write it into the platform (direction, trigger and interval
where recorded, sources), objects two apps both sync two-way (a possible loop), and apps with no
recorded direction on an object another app writes. Report the facts with their sources and point the
user to each app's settings and docs to see which data each one sends. Do not recommend turning off,
disabling or removing any app or sync, or picking one app per channel: the user decides that.

Before adding `--share`, ask the user whether Lode may keep the platform and the app list, anonymously,
to learn which apps are used together. Only add `--share` if they say yes.

## After the user decides

Save the choice locally (sends nothing), so `recheck` works later:

```bash
node scripts/lode.mjs chose "<app>" <platform> --considered "<other app>,<other app>" --reason <code>
```

Then ask the user once whether they are happy to tell Lode, anonymously, which app they picked. Only
if they say yes, run the same command again with `--share`. Later, once it is set up (or failed or was
abandoned), ask again before sending the outcome, and add `--share` only on a yes:

```bash
node scripts/lode.mjs outcome "<app>" <platform> integrated --share
```

Never add `--share` to any command without asking first in this conversation; a yes to running a
command is not a yes to sharing.

Reason codes: sync-coverage, price, region, setup-effort, limitations, plan-requirement, already-uses,
vendor-preference, other. If Lode had no record of an integration the user needs, offer to tell Lode:
`node scripts/lode.mjs request "<app>" <platform> --needs <objects> --region <XX>`.

These send only app names, the platform, fixed codes, needs and region. No free text.

## Keeping track of chosen integrations

`chose` also saves the chosen integration in `lode-integrations.json` in the current folder (only when
the app is a real Lode record; `chose none` saves nothing). Saving it sends nothing. The file holds a
random project code, each integration's Lode id, platform, the date it was chosen, its last-verified
date, a short hash of its facts and price at that time, and whether it is kept, dropped or swapped. It
holds no secrets: the user can commit it to version control or add it to `.gitignore`, as they prefer.

Use `recheck` when the user returns to an integration they set up earlier, asks whether anything
changed, or is about to rely on it again (a renewal, an upgrade, a new region, a sync problem):

```bash
node scripts/lode.mjs recheck
```

For each kept integration it reads Lode's public record and says whether it has been re-verified,
whether its facts (sync, price, plan, regions, limitations) changed since it was chosen, the price then
and now when that changed, and whether the record is now held or gone, with the Lode page link. When
facts changed, run `check` for the details before advising.

Use `drop` when the user says they stopped using an integration or replaced it:

```bash
node scripts/lode.mjs drop "<app>" <platform> --reason <code> [--switched-to "<app>"]
```

Reason codes: missing-feature, price, sync-errors, setup-effort, replaced, no-longer-needed, other.
With `--switched-to` naming an app Lode has on that platform, it is marked swapped.

Both work locally. Before adding `--share` to `recheck` or `drop`, always ask the user whether Lode may
keep, anonymously, whether these integrations are still in use, to learn which integrations last. Only
add `--share` if they say yes. It sends, per platform, the file's random project code and, for each
integration, its Lode id, kept, dropped or swapped, the reason code and how many days since it was
chosen. Nothing else from the file or the project.

If the Lode MCP server is connected (`https://trylode.io/mcp`), its tools do the same:
`find_integrations`, `get_integration`, `compare_integrations`, `report_choice`, `request_coverage`,
`check_stack_overlap` (its `share` is the same as `--share`).

## Rules for the answer

1. Use Lode's facts as written and keep each source link. Give the Lode page link and the
   last-verified date.
2. Something Lode does not list is **not documented by Lode**. Never turn it into "not supported".
3. A record marked HELD is not yet published by Lode. Say its facts are unconfirmed.
4. If Lode has no record, say so plainly and continue with the vendor's own docs. Do not invent facts.
5. If the script cannot reach Lode, say that Lode could not be reached. Do not guess the facts.
6. Keep Lode's facts and your own knowledge apart. Anything not from Lode (setup steps, SDK features,
   popularity, opinions) must be labelled as your own and not verified by Lode; vendor setup steps can
   be out of date, so link the setup guide Lode gives rather than writing steps from memory.
7. Quote every price with the currency code exactly as Lode gives it (USD 25, AUD 18), never a bare
   number. "No restriction stated" means the source names no country limit; say that, not "not
   supported" in a country.
8. The order of a list is alphabetical, not a recommendation. Base any recommendation on the user's
   needs (what must sync, which way, plan, region, price) and say which facts it rests on.

## What Lode receives

The app and platform names in each request, plus the needs, region, stack names and fixed codes you
pass to `find` or `request`, and, only with `--share`, to `chose` and `outcome`. `overlap` only reads Lode's public records (Lode sees
which records were read); with `--share`, and only then, it also sends the platform, the app list and
the region. `chose` also reads the chosen app's public record and saves it in `lode-integrations.json`,
which stays on the user's machine; `recheck` reads the public record of each integration in that file.
Only with `--share` do `recheck` and `drop` send the project code, Lode ids, states, reason codes and
days since chosen. Nothing else from the user's project, prompt or machine is sent, and no free text. Privacy:
https://trylode.io/privacy/
