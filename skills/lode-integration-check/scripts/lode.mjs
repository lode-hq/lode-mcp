#!/usr/bin/env node
// Lode Integration Check: verified, source-linked facts about how one product works with another
// (Xero, QuickBooks Online, HubSpot, Shopify, Stripe, Supabase, Vercel, Netlify, n8n, Lovable, Replit,
// Linear, GitHub, LangChain), read from Lode's
// public JSON API at https://trylode.io/api/. No key, no account, no dependencies (Node 18+).
//
//   node lode.mjs check <app> [platform]      facts for one app, on one platform or on every platform Lode covers
//   node lode.mjs list <platform> [--category <c>] [--all]   apps Lode covers on a platform
//   node lode.mjs platforms                   platforms Lode covers
//   node lode.mjs find <platform> [--category <c>] [--needs a,b] [--region XX] [--stack a,b] [--framework f]
//                                             options ranked by fit to the stated needs (never by payment)
//   node lode.mjs chose <app|none> <platform> [--considered "A,B"] [--reason <code>] [--needs a,b] [--region XX] [--share]
//   node lode.mjs outcome <app> <platform> <integrated|failed|abandoned|not-tried> [--failure-reason <code>] [--switched-to <app>] [--share]
//   node lode.mjs request <app> <platform> [--needs a,b] [--region XX]   tell Lode about an integration it lacks
//   node lode.mjs overlap <platform> --apps "A,B,C" [--region XX] [--share]
//                                             which of the apps write the same objects into the platform
//   node lode.mjs recheck [--share]           what changed in Lode since each integration in lode-integrations.json was chosen
//   node lode.mjs drop <app> <platform> [--reason <code>] [--switched-to <app>] [--share]
//                                             mark an integration in lode-integrations.json as dropped (or swapped)
//   node lode.mjs adr <platform> --considered "A,B" --chose B [--reason <code>] [--status <s>] [--constraint a,b] [--workaround a,b] [--share]
//   node lode.mjs adr --update <file> [--status <s>] [--constraint a,b] [--workaround a,b] [--share]
//                                             write or update a decision record in docs/adr/ in the current folder
//   node lode.mjs stack [--framework f] [--share]   what Lode documents about the apps and platforms this project's manifests name
//   node lode.mjs triage <app> <platform> --symptom <code> [--status 429] [--object o] [--outcome fixed|switched|gave-up] [--switched-to <app>] [--share]
//                                             why an integration fails: Lode's sourced facts for that kind of failure
//   node lode.mjs init [--client claude|cursor|all] [--yes] [--remove]
//                                             add Lode to this project so every teammate and sub-agent has it (shows the files first)
//
// What Lode receives: the app, platform and options in each request (for find and request: the needs,
// region, stack names and fixed codes you pass). chose and outcome send nothing unless --share is
// added after the user agrees; then they send the chosen app, the apps considered, fixed codes, needs
// and region. overlap only reads Lode's
// public records (one request per app), so Lode sees which records were read, as for check; with
// --share it also sends the platform, the app list and the region, and only then. chose also reads the
// chosen app's public record and saves it in lode-integrations.json in the current folder; that file
// stays on your machine. recheck reads the public record of each integration in it. Only with --share
// do recheck and drop send, per platform, the file's random project code and, for each integration,
// its Lode id, kept, dropped or swapped, the fixed reason code and how many days since it was chosen.
// adr writes docs/adr/NNN-<platform>-<app>.md from Lode's public records and saves nothing else; only with
// --share does it send the project code, platform, the Lode ids considered and chosen (only a count of other options),
// the fixed reason, status, constraint and workaround codes, and the days since the decision. stack reads
// only package.json, requirements.txt, pyproject.toml, Gemfile, go.mod, the variable NAMES in .env.example
// (never values), vercel.json, netlify.toml and supabase/config.toml, then Lode's public files; only with
// --share does it send the app and platform codes it found and the framework. triage sends the app, the platform,
// one fixed symptom code and the HTTP status if given (Lode keeps only its class); never error text, logs or code;
// the outcome only with --share. init writes only Lode's server address into .mcp.json and/or .cursor/mcp.json and
// copies this skill into .claude/skills/, after showing the files and only with --yes; it sends nothing to Lode.
// Nothing else from your project, prompt or machine is sent; no free text. https://trylode.io/privacy/
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = (process.env.LODE_BASE || 'https://trylode.io').replace(/\/$/, '');
const UA = process.env.LODE_UA || 'lode-skill/0.1 (+https://trylode.io/agents/)';

export const NAMES = { xero: 'Xero', 'quickbooks-online': 'QuickBooks Online', hubspot: 'HubSpot', shopify: 'Shopify', stripe: 'Stripe', supabase: 'Supabase', vercel: 'Vercel', netlify: 'Netlify', n8n: 'n8n', lovable: 'Lovable', replit: 'Replit', linear: 'Linear', github: 'GitHub', langchain: 'LangChain', cursor: 'Cursor', cloudflare: 'Cloudflare' };
export const PLATFORMS = {
  xero: ['xero'],
  'quickbooks-online': ['quickbooks-online', 'quickbooks', 'qbo', 'quickbooks online', 'intuit quickbooks'],
  hubspot: ['hubspot'],
  shopify: ['shopify'],
  stripe: ['stripe'],
  supabase: ['supabase'],
  vercel: ['vercel'],
  netlify: ['netlify'],
  n8n: ['n8n'],
  lovable: ['lovable', 'lovable dev', 'lovable.dev'],
  replit: ['replit'],
  linear: ['linear', 'linear app', 'linear.app'],
  github: ['github', 'github.com', 'github marketplace'],
  langchain: ['langchain', 'lang chain', 'langgraph'],
  cursor: ['cursor', 'cursor marketplace', 'cursor.com'],
  cloudflare: ['cloudflare', 'cloudflare workers', 'cloudflare pages'],
};

const norm = (s = '') => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const slugish = (s = '') => norm(s).replace(/ /g, '-');

export function platformSlug(input) {
  const n = norm(input);
  for (const [slug, names] of Object.entries(PLATFORMS)) if (names.some((x) => norm(x) === n)) return slug;
  return null;
}

// Rank entries ({id, name, aliases?, domains?}) against what the user typed. Exact id or name first,
// then a name that starts with it, then a whole-word match. Never guesses past that.
export function matchApp(query, entries) {
  const q = norm(query), qs = slugish(query);
  if (!q) return [];
  const score = (e) => {
    const names = [e.name, ...(e.aliases || [])].filter(Boolean).map(norm);
    const id = String(e.id || '').split('--')[0];
    if (id === qs || names.includes(q)) return 3;
    if ((e.domains || []).some((d) => norm(d.split('.')[0]) === q)) return 3;
    if (names.some((n) => n.startsWith(q + ' ')) || id.startsWith(qs + '-')) return 2;
    if (names.some((n) => ` ${n} `.includes(` ${q} `))) return 1;
    return 0;
  };
  const scored = entries.map((e) => [score(e), e]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]);
  if (!scored.length) return [];
  const best = scored[0][0];
  return scored.filter(([s]) => s === best).map(([, e]) => e);
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'user-agent': UA, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 400) throw new Error(`Lode answered HTTP ${res.status} for ${path}`);
  return json;
}

export const CHOICE_REASONS = ['sync-coverage', 'price', 'region', 'setup-effort', 'limitations', 'plan-requirement', 'already-uses', 'vendor-preference', 'other'];
export const OUTCOMES = ['integrated', 'failed', 'abandoned', 'not-tried'];
export const FAILURE_REASONS = ['auth', 'api-error', 'docs', 'missing-feature', 'plan-required', 'pricing', 'region', 'sdk', 'limits', 'other'];
const list = (v) => (typeof v === 'string' ? v.split(',').map((x) => x.trim()).filter(Boolean) : undefined);

// Pick the platform's category that a loose word means ("auth" -> "authentication").
export function categoryFor(word, items) {
  if (!word) return undefined;
  const c = slugish(word);
  const cats = [...new Set(items.flatMap((i) => i.categories || []))];
  return cats.find((x) => x === c) || cats.find((x) => x.startsWith(c)) || cats.find((x) => x.includes(c));
}

export function formatFind(body, ecoName) {
  const r = body.results || [];
  const p = body.profile || {};
  const out = [`## ${ecoName}: ${r.length} option(s) for ${[p.category, p.needs?.length ? `needs ${p.needs.join(', ')}` : '', p.region ? `in ${p.region}` : ''].filter(Boolean).join(', ') || 'your search'}`];
  for (const [i, x] of r.entries()) out.push(`${i + 1}. ${x.app}: ${(x.reasons || []).join('; ') || 'no stated fit'} | ${x.url} | verified ${x.last_verified || 'unknown'}${x.in_stack ? ' | already in your stack' : ''}`);
  if (body.excluded_count) out.push(`${body.excluded_count} other app(s) in scope did not meet the needs or region given.`);
  for (const n of body.input_notes || []) out.push(`Note: ${n}`);
  out.push('Ranked by fit to the needs given; equal scores are genuine ties. Lode never sells placement. Get facts for one option with: node lode.mjs check "<app>" <platform>');
  return out.join('\n');
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Lode answered HTTP ${res.status} for ${path}`);
  return res.json();
}

const DIR = { 'app-to-ecosystem': 'app → platform', 'ecosystem-to-app': 'platform → app', 'two-way': 'both ways', supported: 'supported; direction not documented', 'not-supported': 'documented as not supported' };
const money = (prices = {}) => Object.entries(prices).map(([c, v]) => `${c} ${v}`).join(' / ');
// A plan whose every price is 0 (and has no usage rate) is free: say so in words, never "USD 0" (Paul, 26-11-2026, LOD-152)
const isFreePlan = (pl) => !pl.rate && Object.keys(pl.prices || {}).length > 0 && Object.values(pl.prices).every((v) => v === 0);
const freePlan = (name = '') => (/free/i.test(name) ? (/plan/i.test(name) ? name : `${name} plan`) : `${name}: free`);
const planText = (pl) => (isFreePlan(pl) ? freePlan(pl.name) : `${pl.name}${pl.billing ? ` (${pl.billing})` : ''}: ${money(pl.prices) || pl.rate || 'no published amount'}`);

// One record as compact markdown. Facts are Lode's own sentences; every line keeps its sources.
export function formatRecord(r) {
  const live = r.lode?.publish_state === 'live';
  const name = r.app?.name || r.id;
  const eco = NAMES[r.ecosystem] || r.ecosystem;
  const src = Object.fromEntries((r.sources || []).map((s) => [s.id, s]));
  const cite = (ids = []) => ids.map((id) => src[id]?.url).filter(Boolean);
  const out = [];
  out.push(`## ${name} + ${eco}`);
  out.push(`Lode page: ${r.url} | last verified ${r.verification?.last_verified || 'unknown'}${live ? '' : ' | HELD: Lode has not published this record yet; treat its facts as unconfirmed'}`);
  const c = r.connection || {};
  out.push(`Built by: ${c.built_by || 'not documented'}${c.method ? ` (${c.method})` : ''}${c.certified_by_ecosystem?.value ? '; certified by the platform' : ''}`);
  if (c.setup_docs_url) out.push(`Setup guide: ${c.setup_docs_url}`);
  if (c.marketplace_listing_url) out.push(`Marketplace listing: ${c.marketplace_listing_url}`);
  if (r.sync?.length) {
    out.push('', 'What syncs:');
    for (const s of r.sync) {
      const trig = (s.flows || []).filter((f) => f.trigger && f.trigger !== 'unknown').map((f) => `${f.from === 'app' ? 'from app' : 'from platform'}: ${f.trigger}${f.interval ? ` every ${f.interval}` : ''}`).join('; ');
      out.push(`- ${s.object}: ${DIR[s.direction] || s.direction}${trig ? ` (${trig})` : ''}${s.notes ? `. ${s.notes}` : ''} [${cite(s.src).join(' ')}]`);
    }
  }
  const p = r.pricing || {};
  if (p.model || p.plans?.length) {
    out.push('', `Pricing (${p.model || 'model not stated'}):`);
    for (const pl of p.plans || []) out.push(`- ${planText(pl)}${pl.per ? `, ${pl.per}` : ''} [${cite(pl.src).join(' ')}]`);
  }
  const req = r.requirements || {};
  out.push('', `Platform plan needed: ${req.ecosystem_plan_min && req.ecosystem_plan_min !== 'unknown' ? req.ecosystem_plan_min : 'not documented'}`);
  const reg = r.regions || {};
  out.push(`Regions: ${reg.basis === 'no-restriction-stated' ? 'no restriction stated' : (reg.supported || []).join(', ') || 'not documented'}`);
  if (r.limitations?.length) {
    out.push('', 'Known limitations:');
    for (const l of r.limitations) out.push(`- ${l.summary} [${cite(l.src).join(' ')}]`);
  }
  if (r.verification?.open_flags?.length) out.push('', `Open questions on this record: ${r.verification.open_flags.length}`);
  out.push('', `Cite as: ${r.cite_as || `Lode (trylode.io), ${name} + ${eco}`}`);
  out.push('Anything not listed here is not documented by Lode. That does not mean it is unsupported.');
  return out.join('\n');
}

export function formatList(eco, items, { category, all } = {}) {
  const c = category ? slugish(category) : null;
  const rows = items.filter((i) => !c || (i.categories || []).some((x) => x === c || x.startsWith(c) || x.includes(c)))
    .sort((a, b) => String(a.app).localeCompare(String(b.app)));
  const shown = all ? rows : rows.slice(0, 40);
  const out = [`## Apps Lode covers on ${eco.name}${category ? ` (category: ${category})` : ''}: ${rows.length}`, `Platform page: ${eco.url}`];
  for (const i of shown) out.push(`- ${i.app} [${(i.categories || []).join(', ')}]: ${i.summary || ''} (details: node lode.mjs check "${i.app}" ${eco.slug})`);
  if (rows.length > shown.length) out.push(`...and ${rows.length - shown.length} more (add --all, or --category to narrow).`);
  if (!rows.length && category) out.push(`No apps in that category. Categories on ${eco.name}: ${[...new Set(items.flatMap((i) => i.categories || []))].sort().join(', ')}`);
  out.push('Order is alphabetical by Lode, not a ranking. Lode never sells placement.');
  return out.join('\n');
}

async function check(app, platform) {
  if (platform) {
    const eco = platformSlug(platform);
    if (!eco) return `Lode does not cover "${platform}" yet. Platforms covered: ${Object.keys(PLATFORMS).join(', ')}.`;
    const index = await get(`/api/ecosystems/${eco}.json`);
    const entries = (index?.integrations || []).map((i) => ({ ...i, name: i.app }));
    const hits = matchApp(app, entries);
    if (!hits.length) return `Lode has no record of "${app}" on ${index?.name || eco}. That means not documented by Lode, not that no integration exists. List what Lode covers: node lode.mjs list ${eco}. If the user needs it, tell Lode (with their agreement): node lode.mjs request "${app}" ${eco}`;
    if (hits.length > 1) return `"${app}" matches more than one app on ${index.name}: ${hits.map((h) => h.app).join('; ')}. Run check again with the exact name.`;
    const slug = hits[0].id.split('--')[0];
    const rec = await get(`/api/integrations/${eco}/${slug}.json`);
    return rec ? formatRecord(rec) : `Lode lists ${hits[0].app} on ${index.name} but its record could not be read (${hits[0].api}).`;
  }
  const vendors = (await get('/api/vendors/index.json'))?.vendors || [];
  const hits = matchApp(app, vendors);
  if (!hits.length) return `Lode has no vendor called "${app}". That means not documented by Lode, not that no integration exists.`;
  if (hits.length > 1) return `"${app}" matches more than one vendor: ${hits.map((h) => h.name).join('; ')}. Run check again with the exact name.`;
  const v = hits[0];
  const detail = await get(`/api/vendors/${v.id}.json`);
  const list = detail?.integrations || v.integrations.map((id) => ({ integration_id: id, ecosystem: id.split('--')[1] }));
  const out = [`## ${v.name}: Lode covers ${list.length} integration(s)`];
  for (const i of list) out.push(`- ${NAMES[i.ecosystem] || i.ecosystem}: ${i.page || ''} (details: node lode.mjs check "${v.name}" ${i.ecosystem})`);
  out.push('Run check with a platform for the facts: what syncs and which way, price, plan needed, regions, limitations, sources.');
  return out.join('\n');
}

async function platformIndex(p) {
  const eco = platformSlug(p);
  if (!eco) throw new Error(`Lode does not cover "${p}" yet. Platforms covered: ${Object.keys(PLATFORMS).join(', ')}`);
  return { eco, index: await get(`/api/ecosystems/${eco}.json`) };
}
function idFor(app, index) {
  if (String(app).toLowerCase() === 'none') return 'none';
  const hits = matchApp(app, (index.integrations || []).map((i) => ({ ...i, name: i.app })));
  if (hits.length !== 1) throw new Error(hits.length ? `"${app}" matches more than one app: ${hits.map((h) => h.app).join('; ')}` : `Lode has no record of "${app}" on ${index.name}`);
  return hits[0].id;
}

// LOD-93: kept identical in logic to stackOverlap in Lode's src/lib/overlap.mjs (tests check both agree).
export const OVERLAP_NOTE = 'Facts from Lode\'s published records only. An object not listed for an app means Lode has not documented it, not that the app does not sync it. Two apps writing the same object, or both syncing it two-way, is worth checking in each app\'s settings and docs; this is a list of documented facts, not a recommendation.';
export function stackOverlap(platform, records, { not_found = [], ambiguous = [], region } = {}) {
  const byId = new Map();
  for (const r of records) if (r && r.ecosystem === platform && !byId.has(r.id)) byId.set(r.id, r);
  const all = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const live = all.filter((r) => r.lode?.publish_state === 'live');
  const held = all.filter((r) => r.lode?.publish_state !== 'live').map((r) => ({ id: r.id, app: r.app?.name ?? r.id, url: r.url }));
  const objects = {};
  for (const r of live) {
    const src = Object.fromEntries((r.sources ?? []).map((s) => [s.id, s.url]));
    for (const s of r.sync ?? []) {
      const o = (objects[s.object] ??= { writers: [], undirected: [] });
      const sources = [...new Set((s.src ?? []).map((id) => src[id]).filter(Boolean))];
      const app = r.app?.name ?? r.id;
      if (s.direction === 'app-to-ecosystem' || s.direction === 'two-way') {
        const flows = (s.flows ?? []).filter((f) => f.trigger && f.trigger !== 'unknown').map((f) => ({ from: f.from, trigger: f.trigger, ...(f.interval ? { interval: f.interval } : {}) }));
        o.writers.push({ id: r.id, app, direction: s.direction, ...(flows.length ? { flows } : {}), sources });
      } else if (s.direction === 'supported') o.undirected.push({ id: r.id, app, sources });
    }
  }
  const writes = [], two_way_pairs = [], documented_no_direction = [];
  for (const object of Object.keys(objects).sort()) {
    const { writers, undirected } = objects[object];
    if (!writers.length) continue;
    writes.push({ object, apps: writers });
    const two = writers.filter((w) => w.direction === 'two-way').map((w) => w.id);
    for (let i = 0; i < two.length; i++) for (let j = i + 1; j < two.length; j++) two_way_pairs.push({ object, apps: [two[i], two[j]] });
    for (const u of undirected) if (writers.some((w) => w.id !== u.id)) documented_no_direction.push({ object, ...u });
  }
  const listed = (r) => { const rs = r.regions?.supported ?? []; return rs.includes('GLOBAL') || rs.includes(region); };
  return {
    platform, ...(region ? { region } : {}),
    checked: live.map((r) => ({ id: r.id, app: r.app?.name ?? r.id, url: r.url, last_verified: r.verification?.last_verified, ...(region && !listed(r) ? { region_not_listed: true } : {}) })),
    held, not_found: [...not_found], ...(ambiguous.length ? { ambiguous: [...ambiguous] } : {}),
    writes, shared_objects: writes.filter((w) => w.apps.length > 1).map((w) => w.object), two_way_pairs, documented_no_direction,
    note: OVERLAP_NOTE,
  };
}

const FLOW = (f) => `from ${f.from === 'app' ? 'app' : 'platform'}: ${f.trigger}${f.interval ? ` every ${f.interval}` : ''}`;
export function formatOverlap(o, ecoName) {
  const app = Object.fromEntries([...o.checked, ...o.held].map((c) => [c.id, c.app]));
  const line = (w) => `${w.app} (${DIR[w.direction] || w.direction}${w.flows?.length ? `; ${w.flows.map(FLOW).join('; ')}` : ''}) [${w.sources.join(' ')}]`;
  const out = [`## Stack overlap on ${ecoName}: ${o.checked.length} app(s) checked`];
  for (const c of o.checked) out.push(`- ${c.app}: ${c.url} | verified ${c.last_verified || 'unknown'}${c.region_not_listed ? ` | Lode's record does not list ${o.region} among its regions` : ''}`);
  const shared = o.writes.filter((w) => w.apps.length > 1), single = o.writes.filter((w) => w.apps.length === 1);
  out.push('', shared.length ? `Objects more than one of these apps writes into ${ecoName}:` : `No object is documented as written into ${ecoName} by more than one of these apps.`);
  for (const w of shared) {
    out.push(`- ${w.object}: ${w.apps.map(line).join('; ')}`);
    for (const p of o.two_way_pairs.filter((x) => x.object === w.object)) out.push(`  Both two-way (possible loop): ${app[p.apps[0]]} and ${app[p.apps[1]]}`);
  }
  const nd = o.documented_no_direction;
  if (nd.length) {
    out.push('', 'Also documented on objects another app writes, with no direction recorded:');
    for (const d of nd) out.push(`- ${d.object}: ${d.app} [${d.sources.join(' ')}]`);
  }
  if (single.length) {
    out.push('', `Written into ${ecoName} by one app:`);
    for (const w of single) out.push(`- ${w.object}: ${line(w.apps[0])}`);
  }
  if (o.held.length) out.push('', `Held (not yet published by Lode; facts not used): ${o.held.map((h) => h.app).join(', ')}`);
  for (const a of o.ambiguous || []) out.push(`"${a.input}" matches more than one app: ${a.matches.join('; ')}. Run again with the exact name.`);
  if (o.not_found.length) out.push('', `Not in Lode on ${ecoName}: ${o.not_found.join(', ')} (not documented by Lode, not that no integration exists).`);
  out.push('', o.note);
  return out.join('\n');
}

const REGION = (r) => { const x = String(r).trim().toUpperCase(); return x === 'GB' ? 'UK' : x; };
async function overlap(platform, apps, { region, share } = {}) {
  const { eco, index } = await platformIndex(platform);
  const entries = (index?.integrations || []).map((i) => ({ ...i, name: i.app }));
  const found = [], not_found = [], ambiguous = [];
  for (const a of apps.slice(0, 20)) {
    const hits = matchApp(a, entries);
    if (hits.length === 1) { if (!found.some((f) => f.id === hits[0].id)) found.push(hits[0]); } else if (hits.length) ambiguous.push({ input: a, matches: hits.map((h) => h.id).sort() }); else not_found.push(a);
  }
  const records = (await Promise.all(found.map((h) => get(`/api/integrations/${eco}/${h.id.split('--')[0]}.json`)))).filter(Boolean);
  const reg = typeof region === 'string' ? REGION(region) : undefined;
  let text = formatOverlap(stackOverlap(eco, records, { not_found, ambiguous, region: reg }), index.name);
  if (share) {
    const r = await post('/v1/feedback/stack', { platform: eco, apps: [...found.map((h) => h.id), ...not_found, ...ambiguous.map((x) => x.input)], ...(reg ? { region: reg } : {}) });
    text += r.recorded ? '\n\nShared with Lode: the platform and this app list.' : `\n\nLode did not record the stack${r.message ? `: ${r.message}` : ''}.`;
  }
  return text;
}

// D51 (LOD-90): integration retention. `chose` keeps a local list of chosen integrations in
// lode-integrations.json in the current folder; `recheck` says what changed in Lode since each was
// chosen; `drop` marks one dropped or swapped. The file holds no secrets. Nothing in it is sent unless
// the user passes --share, and then only the project code, Lode ids, states, reason codes and days.
export const LOCAL_FILE = 'lode-integrations.json';
export const RETENTION_REASONS = ['missing-feature', 'price', 'sync-errors', 'setup-effort', 'replaced', 'no-longer-needed', 'other'];
const localPath = () => join(process.cwd(), LOCAL_FILE);
// A random code made once per file, never derived from paths, names or the machine
export const newProject = () => randomUUID().replace(/-/g, '').slice(0, 16);

// JSON with object keys sorted, so the same facts always hash the same way
const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));
// The facts a buyer acts on: who built it, what syncs which way and how, prices, platform plan, regions,
// limitations. Sources, dates and wording of notes are left out, so a re-check alone does not count as a change.
export function factsOf(r) {
  const c = r.connection || {};
  const key = (s) => `${s.object}|${s.direction}`;
  return {
    connection: { built_by: c.built_by ?? null, method: c.method ?? null },
    sync: (r.sync || []).map((s) => ({ object: s.object, direction: s.direction, flows: (s.flows || []).map((f) => ({ from: f.from, trigger: f.trigger ?? null, interval: f.interval ?? null })) })).sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)),
    pricing: { model: r.pricing?.model ?? null, plans: (r.pricing?.plans || []).map((p) => ({ name: p.name, billing: p.billing ?? null, prices: p.prices ?? null, rate: p.rate ?? null })) },
    plan_min: r.requirements?.ecosystem_plan_min ?? null,
    regions: [...(r.regions?.supported || [])].sort(),
    limitations: (r.limitations || []).map((l) => l.summary).sort(),
  };
}
export const factsHash = (r) => createHash('sha256').update(stable(factsOf(r))).digest('hex').slice(0, 12);
export function priceLine(r) {
  const p = r.pricing || {};
  const plans = (p.plans || []).map(planText);
  const line = plans.length ? plans.join('; ') : p.model ? `pricing model: ${p.model}` : 'not documented';
  return line.length > 300 ? `${line.slice(0, 297)}...` : line;
}

export function readLocal(path = localPath()) {
  if (!existsSync(path)) return null;
  let f;
  try { f = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { throw new Error(`${LOCAL_FILE} could not be read (${e.message}); fix or remove it`); }
  if (!f || typeof f !== 'object' || !Array.isArray(f.integrations)) throw new Error(`${LOCAL_FILE} is not in the expected format; fix or remove it`);
  return f;
}
const writeLocal = (f, path = localPath()) => writeFileSync(path, JSON.stringify(f, null, 2) + '\n');
const freshFile = () => ({ version: 1, project: newProject(), share: false, integrations: [] });
const DAY = 86400000;
export const daysBetween = (from, to = new Date()) => { const a = Date.parse(from); return Number.isFinite(a) ? Math.max(0, Math.floor((new Date(to).getTime() - a) / DAY)) : undefined; };

// Save a chosen integration locally. A record chosen again while kept keeps its first date; one dropped
// earlier and chosen again starts over as kept.
export function rememberChoice(f, rec, platform, now = new Date()) {
  const entry = { id: rec.id, platform, chosen_at: now.toISOString(), last_verified: rec.verification?.last_verified ?? null, facts_hash: factsHash(rec), state: 'kept', url: rec.url, price: priceLine(rec) };
  const i = f.integrations.findIndex((x) => x.id === rec.id);
  if (i >= 0 && f.integrations[i].state === 'kept') return f.integrations[i];
  if (i >= 0) f.integrations[i] = entry; else f.integrations.push(entry);
  return entry;
}

async function saveChoice(eco, id) {
  try {
    const rec = await get(`/api/integrations/${eco}/${id.split('--')[0]}.json`);
    if (!rec) return '';
    const f = readLocal() || freshFile();
    rememberChoice(f, rec, eco);
    writeLocal(f);
    return `\nSaved to ${LOCAL_FILE} in this folder; the file stays on this machine. Later, run: node lode.mjs recheck`;
  } catch (e) { return `\nNot saved to ${LOCAL_FILE}: ${e.message}.`; }
}

// One line per integration: what changed in Lode since it was chosen. `rec` is the public record now (null if gone).
export function formatRecheckItem(it, rec, now = new Date()) {
  const eco = NAMES[it.platform] || it.platform;
  const name = rec?.app?.name || it.id.split('--')[0];
  const since = String(it.chosen_at || '').slice(0, 10) || 'unknown date';
  const out = [`- ${name} on ${eco}: ${it.state}${it.state === 'swapped' && it.switched_to ? ` for ${it.switched_to}` : ''}, chosen ${since} (${daysBetween(it.chosen_at, now) ?? '?'} days ago) | ${rec?.url || it.url || ''}`];
  if (it.state !== 'kept') { out.push(`  Not rechecked: marked ${it.state}${it.reason ? ` (${it.reason})` : ''}${it.dropped_at ? ` on ${String(it.dropped_at).slice(0, 10)}` : ''}.`); return out.join('\n'); }
  if (!rec) { out.push('  No longer in Lode: the record has been removed. Check the integration with the vendor directly.'); return out.join('\n'); }
  if (rec.lode?.publish_state !== 'live') out.push('  Now HELD by Lode: it has not confirmed this record\'s facts; treat them as unconfirmed.');
  const lv = rec.verification?.last_verified;
  out.push(`  Last verified: ${it.last_verified || 'unknown'} when chosen; ${lv || 'unknown'} now${lv && lv !== it.last_verified ? ' (re-checked since)' : ''}`);
  const changed = it.facts_hash && factsHash(rec) !== it.facts_hash;
  out.push(changed ? `  Facts CHANGED since chosen (sync, price, plan, regions or limitations). Read the record: node lode.mjs check "${name}" ${it.platform}` : it.facts_hash ? '  Facts unchanged since chosen.' : '  Facts at the time of choosing were not saved, so changes cannot be compared.');
  const p = priceLine(rec);
  if (it.price && p !== it.price) out.push(`  Price then: ${it.price}`, `  Price now: ${p}`);
  return out.join('\n');
}

// What --share sends for one platform: the project code and, per integration, its id, state, reason and days
export function retentionPayload(f, platform, now = new Date()) {
  return {
    project: f.project, platform,
    items: f.integrations.filter((x) => x.platform === platform).map((x) => ({
      id: x.id, state: x.state, ...(x.state !== 'kept' && x.reason ? { reason: x.reason } : {}), ...(x.state === 'swapped' && x.switched_to ? { switched_to: x.switched_to } : {}),
      // days since chosen; for an integration dropped or swapped, how long it was kept
      ...(daysBetween(x.chosen_at, x.state !== 'kept' && x.dropped_at ? x.dropped_at : now) !== undefined ? { days: daysBetween(x.chosen_at, x.state !== 'kept' && x.dropped_at ? x.dropped_at : now) } : {}),
    })),
  };
}

async function shareRetention(f, platforms) {
  const out = [];
  for (const platform of platforms) {
    const body = retentionPayload(f, platform);
    for (let i = 0; i < body.items.length; i += 20) {
      const r = await post('/v1/feedback/retention', { ...body, items: body.items.slice(i, i + 20) });
      out.push(r.recorded ? `Shared with Lode for ${NAMES[platform] || platform}: the project code, and for each integration whether it is kept, dropped or swapped and how many days since it was chosen.` : `Lode did not record this for ${platform}${r.message ? `: ${r.message}` : ''}.`);
    }
  }
  return out.join('\n');
}

async function recheck({ share } = {}) {
  const f = readLocal();
  if (!f || !f.integrations.length) return `No integrations recorded in ${LOCAL_FILE} in this folder. It is made when a choice is recorded: node lode.mjs chose <app> <platform>`;
  const now = new Date();
  const lines = [`## Recheck of ${f.integrations.length} integration(s) in ${LOCAL_FILE}`];
  for (const it of f.integrations) {
    const rec = it.state === 'kept' ? await get(`/api/integrations/${it.platform}/${it.id.split('--')[0]}.json`) : null;
    lines.push(formatRecheckItem(it, rec, now));
  }
  lines.push('', 'Changes are what Lode\'s published record says now against what it said when chosen. Anything not listed is not documented by Lode.');
  const adrs = syncAdrs(f, { now });
  if (adrs.length) lines.push('', `Decision records updated: ${adrs.join('; ')}.`);
  if (share) lines.push('', await shareRetention(f, [...new Set(f.integrations.map((x) => x.platform))]));
  return lines.join('\n');
}

async function drop(app, platform, { reason, switched, share } = {}) {
  const { eco, index } = await platformIndex(platform);
  const id = idFor(app, index);
  if (id === 'none') return 'Name the app to drop.';
  const f = readLocal();
  const it = f?.integrations.find((x) => x.id === id);
  if (!it) return `${id} is not in ${LOCAL_FILE} in this folder. Record it first with: node lode.mjs chose "${app}" ${eco}`;
  let to, unresolved;
  if (typeof switched === 'string') { try { to = idFor(switched, index); } catch { unresolved = switched; } }
  if (to && to !== 'none' && to !== id) { it.state = 'swapped'; it.switched_to = to; } else { it.state = 'dropped'; delete it.switched_to; }
  // A reason outside the fixed list becomes "other"; a replacement Lode doesn't cover counts as "replaced"
  const code = typeof reason === 'string' ? (RETENTION_REASONS.includes(reason) ? reason : 'other') : unresolved ? 'replaced' : undefined;
  if (code) it.reason = code; else delete it.reason;
  it.dropped_at = new Date().toISOString();
  writeLocal(f);
  const adrs = syncAdrs(f);
  let text = `Marked ${id} as ${it.state}${it.switched_to ? ` for ${it.switched_to}` : ''}${it.reason ? ` (reason: ${it.reason})` : ''} in ${LOCAL_FILE}. Nothing was sent.`;
  if (unresolved) text += `\n"${unresolved}" is not in Lode on ${index.name}; it was not recorded. If the user agrees, tell Lode: node lode.mjs request "${unresolved}" ${eco}`;
  if (adrs.length) text += `\nDecision record updated: ${adrs.join('; ')}.`;
  if (it.switched_to) text += `\nTo track the new integration too: node lode.mjs chose "${switched}" ${eco} (saves locally; add --share only if the user agrees)`;
  if (share) {
    const r = await post('/v1/feedback/retention', { project: f.project, platform: eco, items: retentionPayload(f, eco).items.filter((x) => x.id === id) });
    text = text.replace(' Nothing was sent.', '') + (r.recorded ? '\nShared with Lode: the project code, this integration\'s Lode id, its new state, the reason code and how many days it was kept.' : `\nLode did not record it${r.message ? `: ${r.message}` : ''}.`);
  }
  return text;
}

// ---- D55 (LOD-102): integration decision records. `adr` writes docs/adr/NNN-<platform>-<app>.md in the
// current folder: a short record built only from Lode's public facts, with a structured block of fixed
// codes in its frontmatter. Nothing is sent unless --share is added after the user agrees; then only the
// project code, platform, Lode record ids (other options only as a count), the codes, the status and the days since.
export const DECISION_STATUSES = ['proposed', 'accepted', 'shipped', 'kept', 'dropped', 'swapped'];
export const CONSTRAINTS = ['plan-wall', 'rate-limit', 'missing-object', 'one-way-only', 'timeout', 'webhook-gap', 'region', 'currency', 'auth', 'price', 'other'];
export const WORKAROUNDS = ['custom-retry', 'custom-idempotency', 'polling-not-webhooks', 'extra-sync-tool', 'manual-step', 'plan-upgrade', 'custom-field-mapping', 'batching-for-rate-limits', 'background-job-for-timeouts', 'currency-handling', 'other'];
export const ADR_DIR = join('docs', 'adr');
export const dmy = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : 'unknown date'; };
const today = (now = new Date()) => new Date(now).toISOString().slice(0, 10);

// Codes from a comma list; any code outside the fixed list refuses the command (returns the bad ones)
export function checkCodes(value, allowed) {
  const given = typeof value === 'string' ? value.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) : [];
  return { codes: [...new Set(given.filter((c) => allowed.includes(c)))], bad: given.filter((c) => !allowed.includes(c)) };
}

// Frontmatter: one `key: value` per line, values as JSON (valid YAML), so the file needs no YAML library
export function parseAdr(text) {
  // CRLF and a leading BOM are accepted: git on Windows (core.autocrlf) checks the file out with CRLF
  const m = String(text).match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i < 1) continue;
    const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
    try { meta[k] = JSON.parse(v); } catch { meta[k] = v; }
  }
  return meta.lode_adr ? { meta, body: text.slice(m[0].length) } : null;
}
const ADR_KEYS = ['lode_adr', 'project', 'platform', 'considered', 'chosen', 'reason', 'status', 'constraints', 'workarounds', 'decided', 'updated', 'rechecked', 'switched_to'];
export const adrFrontmatter = (meta) => `---\n${ADR_KEYS.filter((k) => meta[k] !== undefined).map((k) => `${k}: ${JSON.stringify(meta[k])}`).join('\n')}\n---\n`;
const label = (c) => c.replace(/-/g, ' ');
export function adrCodesBlock(meta) {
  const c = meta.constraints || [], w = meta.workarounds || [];
  return ['<!-- lode:codes -->', `Constraints hit: ${c.length ? c.map(label).join(', ') : 'none recorded'}`, '', `Workarounds built: ${w.length ? w.map(label).join(', ') : 'none recorded'}`, '<!-- /lode:codes -->'].join('\n');
}
const statusLine = (meta) => `**Status:** ${meta.status} (${dmy(meta.updated || meta.decided)})${meta.switched_to ? `, switched to ${meta.switched_to}` : ''}`;

// The facts for one option, each line with its Lode page and last-verified date. Built only from the
// public record; anything the record doesn't hold is "not documented", never "not supported".
export function adrFacts(opt, ecoName) {
  const r = opt.rec;
  if (!r) return [`### ${opt.name}${opt.chosen ? ' (chosen)' : ''}`, `Lode has no record of ${opt.name} on ${ecoName}: not documented by Lode, which does not mean no integration exists.`];
  const at = `[Lode](${r.url}), verified ${dmy(r.verification?.last_verified)}`;
  const src = Object.fromEntries((r.sources || []).map((s) => [s.id, s.url]));
  const out = [`### ${r.app?.name || opt.name}${opt.chosen ? ' (chosen)' : ''}`, `Lode page: ${r.url} (last verified ${dmy(r.verification?.last_verified)})`];
  if (r.lode?.publish_state !== 'live') out.push('Held by Lode: these facts are not yet confirmed.');
  const c = r.connection || {};
  out.push(`- Built by: ${c.built_by || 'not documented'}. ${at}`);
  for (const s of r.sync || []) out.push(`- ${s.object}: ${DIR[s.direction] || s.direction}${s.notes ? `. ${s.notes}` : ''}${(s.src || []).length ? ` (source: ${(s.src || []).map((id) => src[id]).filter(Boolean).join(' ')})` : ''}. ${at}`);
  if (!(r.sync || []).length) out.push(`- What syncs: not documented. ${at}`);
  out.push(`- Price: ${priceLine(r)}. ${at}`);
  const plan = r.requirements?.ecosystem_plan_min;
  out.push(`- ${ecoName} plan needed: ${plan && plan !== 'unknown' ? plan : 'not documented'}. ${at}`);
  const reg = r.regions || {};
  out.push(`- Regions: ${reg.basis === 'no-restriction-stated' ? 'no restriction stated' : (reg.supported || []).join(', ') || 'not documented'}. ${at}`);
  for (const l of r.limitations || []) out.push(`- Limitation: ${String(l.summary).replace(/[.\s]*$/, '.')} ${at}`);
  return out;
}

export function adrMarkdown(meta, options, ecoName, n) {
  const chosen = options.find((o) => o.chosen);
  const title = `# ${String(n).padStart(3, '0')}. ${chosen?.rec?.app?.name || chosen?.name || meta.chosen} for ${ecoName}`;
  return [
    adrFrontmatter(meta) + title, '', statusLine(meta), '',
    '## Context', `Integration needed on ${ecoName}. Options considered: ${options.map((o) => o.rec?.app?.name || o.name).join(', ')}.`, '',
    '## Decision', `Chose ${chosen?.rec?.app?.name || chosen?.name || meta.chosen}${meta.reason ? `. Main reason: ${label(meta.reason)}` : ''}.`, '',
    '## Constraints and workarounds', adrCodesBlock(meta), '',
    `## Facts from Lode on ${dmy(meta.decided)}`, ...options.flatMap((o) => [...adrFacts(o, ecoName), '']),
    'Facts are from Lode\'s public records (trylode.io), each with its Lode page and last-verified date. Anything not listed is not documented by Lode, which does not mean it is unsupported. Re-check with: node lode.mjs recheck', '',
  ].join('\n');
}

// Update the frontmatter, the status line and the codes block; the rest of the file is left as written
export function applyAdrUpdate(text, changes) {
  const p = parseAdr(text);
  if (!p) throw new Error('not a Lode decision record (no lode_adr frontmatter)');
  const meta = { ...p.meta, ...changes };
  for (const k of ['constraints', 'workarounds']) if (changes[k]) meta[k] = [...new Set([...(p.meta[k] || []), ...changes[k]])];
  let body = p.body.replace(/^\*\*Status:\*\*.*$/m, statusLine(meta));
  body = /<!-- lode:codes -->[\s\S]*?<!-- \/lode:codes -->/.test(body) ? body.replace(/<!-- lode:codes -->[\s\S]*?<!-- \/lode:codes -->/, adrCodesBlock(meta)) : `${body.trimEnd()}\n\n## Constraints and workarounds\n${adrCodesBlock(meta)}\n`;
  return { meta, text: adrFrontmatter(meta) + body };
}

// What --share sends for a decision: codes and ids only
export function decisionPayload(meta, now = new Date()) {
  const days = daysBetween(meta.decided, now);
  // Only Lode record ids leave the machine. Options Lode has no record of (an in-house tool, another
  // product) stay in the local file; only how many there were is sent.
  const isId = (x) => typeof x === 'string' && x.includes('--');
  const others = (meta.considered || []).filter((x) => !isId(x)).length;
  return { project: meta.project, platform: meta.platform, considered: (meta.considered || []).filter(isId), chosen: isId(meta.chosen) ? meta.chosen : 'other', ...(others ? { other_options: others } : {}), ...(meta.reason ? { reason: meta.reason } : {}), status: meta.status, constraints: meta.constraints || [], workarounds: meta.workarounds || [], ...(days !== undefined ? { days } : {}) };
}

const adrDir = () => join(process.cwd(), ADR_DIR);
export function listAdrs(dir = adrDir()) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^\d{3,}-.*\.md$/.test(f)).sort().map((f) => { const path = join(dir, f); const p = parseAdr(readFileSync(path, 'utf8')); return p ? { file: f, path, meta: p.meta } : null; }).filter(Boolean);
}
export const nextAdrNumber = (dir = adrDir()) => (existsSync(dir) ? readdirSync(dir).map((f) => Number((f.match(/^(\d{3,})-/) || [])[1] || 0)).reduce((a, b) => Math.max(a, b), 0) : 0) + 1;

async function shareDecision(meta) {
  const r = await post('/v1/feedback/decision', decisionPayload(meta));
  return r.recorded ? 'Shared with Lode (the user agreed): the project code, platform, the Lode ids considered and chosen, the reason, status, constraint and workaround codes, and the days since the decision.' : `Lode did not record the decision${r.message ? `: ${r.message}` : ''}.`;
}

async function adr(platform, opts) {
  const bad = [];
  const cons = checkCodes(opts.constraint, CONSTRAINTS), work = checkCodes(opts.workaround, WORKAROUNDS);
  if (cons.bad.length) bad.push(`constraint ${cons.bad.join(', ')} (allowed: ${CONSTRAINTS.join(', ')})`);
  if (work.bad.length) bad.push(`workaround ${work.bad.join(', ')} (allowed: ${WORKAROUNDS.join(', ')})`);
  if (typeof opts.reason === 'string' && !CHOICE_REASONS.includes(opts.reason)) bad.push(`reason ${opts.reason} (allowed: ${CHOICE_REASONS.join(', ')})`);
  if (typeof opts.status === 'string' && !DECISION_STATUSES.includes(opts.status)) bad.push(`status ${opts.status} (allowed: ${DECISION_STATUSES.join(', ')})`);
  if (bad.length) return `Refused: unknown code. ${bad.join('; ')}. Nothing was written or sent.`;

  if (typeof opts.update === 'string') {
    const path = opts.update;
    if (!existsSync(path)) return `No file at ${path}.`;
    const changes = { updated: today() };
    if (typeof opts.status === 'string') changes.status = opts.status;
    if (typeof opts.reason === 'string') changes.reason = opts.reason;
    if (cons.codes.length) changes.constraints = cons.codes;
    if (work.codes.length) changes.workarounds = work.codes;
    let u;
    try { u = applyAdrUpdate(readFileSync(path, 'utf8'), changes); } catch (e) { return `Not updated: ${e.message}.`; }
    writeFileSync(path, u.text);
    let text = `Updated ${path}: status ${u.meta.status}; constraints ${(u.meta.constraints || []).join(', ') || 'none'}; workarounds ${(u.meta.workarounds || []).join(', ') || 'none'}.`;
    text += opts.share === true ? `\n${await shareDecision(u.meta)}` : '\nNot sent to Lode. Only if the user agrees to share this decision\'s codes anonymously, run this again with --share.';
    return text;
  }

  const considered = list(typeof opts.considered === 'string' ? opts.considered : undefined) || [];
  if (typeof opts.chose !== 'string' || !slugish(opts.chose)) return 'Name the app chosen: node lode.mjs adr <platform> --considered "A,B" --chose B';
  const { eco, index } = await platformIndex(platform);
  const entries = (index?.integrations || []).map((i) => ({ ...i, name: i.app }));
  const resolve = (a) => {
    const hits = matchApp(a, entries);
    if (hits.length > 1) throw new Error(`"${a}" matches more than one app on ${index.name}: ${hits.map((h) => h.app).join('; ')}. Use the exact name`);
    return hits.length ? { key: hits[0].id, name: hits[0].app, id: hits[0].id } : { key: slugish(a).slice(0, 60), name: a.slice(0, 60) };
  };
  let options;
  try {
    const all = [...considered, opts.chose].map(resolve);
    options = [];
    for (const o of all) if (o.key && !options.some((x) => x.key === o.key)) options.push(o);
  } catch (e) { return `Not written: ${e.message}.`; }
  options = options.slice(0, 10);
  const chosenKey = resolve(opts.chose).key;
  if (!options.some((o) => o.key === chosenKey)) options[options.length - 1] = resolve(opts.chose);
  for (const o of options) { o.chosen = o.key === chosenKey; o.rec = o.id ? await get(`/api/integrations/${eco}/${o.id.split('--')[0]}.json`) : null; }

  const f = readLocal() || freshFile();
  const chosenOpt = options.find((o) => o.chosen);
  if (chosenOpt.rec) rememberChoice(f, chosenOpt.rec, eco);
  writeLocal(f);
  const now = today();
  const meta = { lode_adr: 1, project: f.project, platform: eco, considered: options.map((o) => o.key), chosen: chosenKey, ...(typeof opts.reason === 'string' ? { reason: opts.reason } : {}), status: typeof opts.status === 'string' ? opts.status : 'proposed', constraints: cons.codes, workarounds: work.codes, decided: now, updated: now };
  const n = nextAdrNumber();
  mkdirSync(adrDir(), { recursive: true });
  const file = join(ADR_DIR, `${String(n).padStart(3, '0')}-${eco}-${String(chosenKey).split('--')[0]}.md`);
  writeFileSync(join(process.cwd(), file), adrMarkdown(meta, options, index.name, n));
  let text = `Wrote ${file} (status ${meta.status}). It holds Lode's facts for each option, with links and last-verified dates.${chosenOpt.rec ? ` Saved the choice to ${LOCAL_FILE} too, so recheck and drop keep the record current.` : ''}\nWhen it ships or hits a limit: node lode.mjs adr --update ${file} --status shipped [--constraint ${CONSTRAINTS[0]}] [--workaround ${WORKAROUNDS[0]}]`;
  text += opts.share === true ? `\n${await shareDecision(meta)}` : `\nNot sent to Lode. Only if the user agrees to share the decision's codes anonymously, run: node lode.mjs adr --update ${file} --share`;
  return text;
}

// recheck and drop keep a matching decision record in step with lode-integrations.json: the recheck date,
// and dropped or swapped when the integration was. They never mark a decision kept (the user says that
// with adr --update). Nothing is sent from here.
export function syncAdrs(f, { now = new Date(), dir = adrDir() } = {}) {
  const changed = [];
  for (const a of listAdrs(dir)) {
    const it = f.integrations.find((x) => x.id === a.meta.chosen);
    if (!it) continue;
    const changes = { rechecked: today(now) };
    if (it.state !== 'kept' && a.meta.status !== it.state) Object.assign(changes, { status: it.state, updated: today(now), ...(it.switched_to ? { switched_to: it.switched_to } : {}) });
    const u = applyAdrUpdate(readFileSync(a.path, 'utf8'), changes);
    writeFileSync(a.path, u.text);
    if (changes.status) changed.push(`${join(ADR_DIR, a.file)}: status ${changes.status}`);
  }
  return changed;
}

// ---- D56 (LOD-102): stack check. Reads only the manifest files below (and only the variable NAMES in
// .env.example, never values), maps them to Lode apps and platforms with /api/stack-signals.json, and
// reports Lode's facts for that stack. Nothing is sent unless --share is added after the user agrees.
export const MANIFESTS = ['package.json', 'requirements.txt', 'pyproject.toml', 'Gemfile', 'go.mod', '.env.example', 'vercel.json', 'netlify.toml', join('supabase', 'config.toml')];
export function parsePackageJson(text) {
  try { const j = JSON.parse(text); return [...new Set(['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].flatMap((k) => Object.keys(j?.[k] || {})))]; } catch { return []; }
}
const pyName = (s) => (String(s).trim().match(/^([A-Za-z0-9][A-Za-z0-9._-]*)/) || [])[1];
export function parseRequirements(text) {
  return [...new Set(String(text).split('\n').map((l) => l.replace(/#.*/, '').trim()).filter((l) => l && !l.startsWith('-')).map(pyName).filter(Boolean))];
}
export function parsePyproject(text) {
  const out = new Set();
  const t = String(text);
  for (const m of t.matchAll(/^\s*(?:dependencies|requires)\s*=\s*\[([\s\S]*?)\]/gm)) for (const q of m[1].matchAll(/["']([^"']+)["']/g)) { const n = pyName(q[1]); if (n) out.add(n); }
  for (const sec of t.matchAll(/^\[tool\.poetry\.(?:dev-)?dependencies\]\n([\s\S]*?)(?=^\[|$(?![\s\S]))/gm)) for (const l of sec[1].split('\n')) { const n = (l.match(/^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*=/) || [])[1]; if (n && n !== 'python') out.add(n); }
  return [...out];
}
export function parseGemfile(text) { return [...new Set([...String(text).matchAll(/^\s*gem\s+["']([^"']+)["']/gm)].map((m) => m[1]))]; }
export function parseGoMod(text) {
  const out = new Set();
  const t = String(text);
  for (const m of t.matchAll(/^require\s+\(([\s\S]*?)\)/gm)) for (const l of m[1].split('\n')) { const p = l.trim().split(/\s+/)[0]; if (p && !p.startsWith('//')) out.add(p); }
  for (const m of t.matchAll(/^require\s+([^\s(]+)\s+/gm)) out.add(m[1]);
  return [...out];
}
// Variable names only: the part before "=" on each line. Values are never read into the result.
export function parseEnvNames(text) { return [...new Set(String(text).split('\n').map((l) => (l.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/) || [])[1]).filter(Boolean))]; }

export function readManifests(dir = process.cwd()) {
  const read = (f) => { const p = join(dir, f); return existsSync(p) ? readFileSync(p, 'utf8') : null; };
  const pkg = read('package.json'), req = read('requirements.txt'), py = read('pyproject.toml'), gem = read('Gemfile'), gomod = read('go.mod'), env = read('.env.example');
  return {
    npm: pkg ? parsePackageJson(pkg) : [], pypi: [...(req ? parseRequirements(req) : []), ...(py ? parsePyproject(py) : [])], gem: gem ? parseGemfile(gem) : [], go: gomod ? parseGoMod(gomod) : [],
    env: env ? parseEnvNames(env) : [], files: MANIFESTS.filter((f) => existsSync(join(dir, f))).map((f) => f.split('\\').join('/')),
  };
}

const FRAMEWORK_SIGNS = [['nextjs', 'npm', 'next'], ['remix', 'npm', '@remix-run/react'], ['astro', 'npm', 'astro'], ['sveltekit', 'npm', '@sveltejs/kit'], ['nuxt', 'npm', 'nuxt'], ['angular', 'npm', '@angular/core'], ['nestjs', 'npm', '@nestjs/core'], ['express', 'npm', 'express'], ['react', 'npm', 'react'], ['vue', 'npm', 'vue'], ['django', 'pypi', 'django'], ['fastapi', 'pypi', 'fastapi'], ['flask', 'pypi', 'flask'], ['rails', 'gem', 'rails']];
export function detectFramework(m) {
  for (const [fw, kind, name] of FRAMEWORK_SIGNS) if ((m[kind] || []).some((x) => x.toLowerCase() === name)) return fw;
  return (m.go || []).length ? 'go' : undefined;
}

// Manifests -> the stack-signal products found, each with what matched (kept on the user's machine)
export function detectStack(m, doc) {
  const pub = doc.env_public_prefixes || [];
  const envs = (m.env || []).map((n) => { const u = n.toUpperCase(); const p = pub.find((x) => u.startsWith(x)); return p ? u.slice(p.length) : u; });
  const lower = (a) => (a || []).map((x) => x.toLowerCase());
  const has = { npm: lower(m.npm), pypi: lower(m.pypi).map((x) => x.replace(/_/g, '-')), gem: lower(m.gem), go: lower(m.go) };
  const apps = [];
  for (const s of doc.signals || []) {
    const evidence = [];
    for (const k of ['npm', 'pypi', 'gem']) for (const p of s[k] || []) if (has[k].includes(k === 'pypi' ? p.toLowerCase().replace(/_/g, '-') : p.toLowerCase())) evidence.push(`${k} ${p}`);
    for (const p of s.go || []) if (has.go.some((x) => x === p.toLowerCase() || x.startsWith(`${p.toLowerCase()}/`))) evidence.push(`go ${p}`);
    for (const e of s.env || []) if (envs.some((n) => n.startsWith(e))) evidence.push(`env ${e}*`);
    for (const f of s.files || []) if ((m.files || []).includes(f)) evidence.push(`file ${f}`);
    if (evidence.length) apps.push({ id: s.id, name: s.name, vendor: s.vendor ?? null, ...(s.platform ? { platform: s.platform } : {}), ...(s.app ? { app: s.app } : {}), evidence });
  }
  return apps;
}

// LOD-102: kept identical in logic to stackPairs and stackCheck in Lode's src/lib/stackcheck.mjs (tests check both agree).
export const STACK_NOTE = 'Facts from Lode\'s published records and the platforms\' own docs, each with its link. Lode does not read or judge your code. An app with no Lode record on a platform is not documented by Lode, not unsupported; a plan or limit not listed is not documented. Limits are the platform\'s published numbers on the date read.';
export function stackPairs({ apps = [], platforms = [] }, { listings = {}, covered = [] } = {}) {
  const inStack = [...new Set([...platforms, ...apps.map((a) => a.platform).filter(Boolean)])];
  const live = inStack.filter((p) => covered.includes(p)).sort();
  const known = new Set(Object.values(listings).flat());
  const pairs = [];
  for (const platform of live) {
    for (const a of apps) {
      if (a.platform === platform) continue;
      const own = (a.vendor ? listings[a.vendor] ?? [] : []).filter((id) => id.endsWith(`--${platform}`));
      const ids = a.app ? [`${a.app}--${platform}`].filter((id) => known.has(id)) : own;
      pairs.push({ platform, app: a.name, ids });
    }
  }
  return { platforms: live, not_covered: inStack.filter((p) => !covered.includes(p)).sort(), pairs };
}

export function stackCheck(input, data, overlap) {
  const { platforms, not_covered, pairs } = stackPairs(input, data);
  const byId = new Map((data.records ?? []).filter(Boolean).map((r) => [r.id, r]));
  const names = data.names ?? {};
  const out = [];
  for (const platform of platforms) {
    const here = pairs.filter((p) => p.platform === platform);
    const recs = [...new Set(here.flatMap((p) => p.ids))].map((id) => byId.get(id)).filter(Boolean).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const integrations = recs.map((r) => {
      const req = r.requirements ?? {};
      const src = Object.fromEntries((r.sources ?? []).map((s) => [s.id, s.url]));
      const plan = req.ecosystem_plan_min && req.ecosystem_plan_min !== 'unknown' ? req.ecosystem_plan_min : null;
      const planSources = plan ? [...new Set((req.src ?? []).map((id) => src[id]).filter(Boolean))] : [];
      return {
        id: r.id, app: r.app?.name ?? r.id, url: r.url, last_verified: r.verification?.last_verified ?? null,
        ...(r.lode?.publish_state === 'live' ? {} : { held: true }),
        plan_needed: plan ?? 'not documented', ...(planSources.length ? { plan_sources: planSources } : {}),
      };
    });
    const missing = here.filter((p) => !p.ids.some((id) => byId.has(id))).map((p) => p.app).sort();
    const ov = recs.length >= 2 ? overlap(platform, recs) : null;
    const limits = (data.limits ?? []).filter((l) => l.platform === platform).map((l) => ({
      product: l.product, limit: l.limit, plan: l.plan ?? null, seconds: l.seconds, ...(l.condition ? { condition: l.condition } : {}),
      url: l.source.url, quote: l.source.quote, retrieved_at: l.source.retrieved_at,
    }));
    out.push({
      platform, name: names[platform] ?? platform, integrations, not_in_lode: missing,
      ...(ov ? { overlap: { shared_objects: ov.shared_objects, writes: ov.writes.filter((w) => w.apps.length > 1), two_way_pairs: ov.two_way_pairs, documented_no_direction: ov.documented_no_direction } } : {}),
      limits,
    });
  }
  return {
    ...(input.framework ? { framework: input.framework } : {}),
    apps: (input.apps ?? []).map((a) => ({ name: a.name, vendor: a.vendor ?? null, ...(a.platform ? { platform: a.platform } : {}) })),
    ...(input.unrecognised?.length ? { unrecognised: [...input.unrecognised] } : {}),
    platforms: out, platforms_not_covered: not_covered,
    note: STACK_NOTE,
  };
}

const secs = (s) => (s >= 60 && s % 60 === 0 ? `${s}s (${s / 60} min)` : s < 1 ? `${Math.round(s * 1000)} ms` : `${s}s`);
export function formatStack(res, detected = []) {
  const out = [`## Stack check: ${res.apps.length} app(s) and platform(s) found${res.framework ? `, framework ${res.framework}` : ''}`];
  for (const d of detected) out.push(`- ${d.name}${d.platform ? ' (platform)' : ''}: ${d.evidence.join(', ')}${d.vendor ? '' : ' | no Lode vendor yet'}`);
  for (const p of res.platforms) {
    out.push('', `### ${p.name}`);
    if (p.integrations.length) out.push('Lode records for the other apps in this stack:');
    for (const i of p.integrations) out.push(`- ${i.app}: ${p.name} plan needed: ${i.plan_needed}${i.plan_sources ? ` [${i.plan_sources.join(' ')}]` : ''} | ${i.url} | verified ${dmy(i.last_verified)}${i.held ? ' | HELD: not yet confirmed by Lode' : ''}`);
    if (p.not_in_lode.length) out.push(`Not in Lode on ${p.name}: ${p.not_in_lode.join(', ')} (not documented by Lode, not unsupported).`);
    const shared = p.overlap?.writes || [];
    if (shared.length) {
      out.push(`Objects more than one of these apps writes into ${p.name}:`);
      for (const w of shared) out.push(`- ${w.object}: ${w.apps.map((a) => `${a.app} (${DIR[a.direction] || a.direction}) [${a.sources.join(' ')}]`).join('; ')}`);
      for (const t of p.overlap.two_way_pairs) out.push(`  Both two-way: ${t.apps.join(' and ')} on ${t.object}`);
    } else if (p.overlap) out.push(`No object is documented as written into ${p.name} by more than one of these apps.`);
    if (p.limits.length) {
      out.push(`${p.name} function run-time limits (the platform's docs):`);
      for (const l of p.limits) out.push(`- ${l.product}, ${l.limit.replace(/-/g, ' ')}${l.plan ? `, ${l.plan}` : ''}: ${secs(l.seconds)}${l.condition ? ` (${l.condition})` : ''}. "${l.quote}" ${l.url} (read ${dmy(l.retrieved_at)})`);
    }
  }
  if (res.platforms_not_covered.length) out.push('', `Platforms Lode does not cover yet: ${res.platforms_not_covered.join(', ')}.`);
  if (!res.platforms.length) out.push('', 'No platform Lode covers was found in these files (Xero, QuickBooks Online, HubSpot, Shopify, Stripe, Supabase, Vercel, Netlify, n8n, Lovable, Replit, Linear, GitHub, LangChain).');
  out.push('', res.note);
  return out.join('\n');
}

async function stack({ share, framework } = {}) {
  const m = readManifests();
  const found = m.files.filter((f) => f !== '.env.example' || m.env.length);
  if (!found.length) return `No manifest files in this folder. The stack check reads only: ${MANIFESTS.join(', ')} (variable names only from .env.example).`;
  const [doc, limitsDoc, index, vendors] = await Promise.all([get('/api/stack-signals.json'), get('/api/platform-limits.json'), get('/api/index.json'), get('/api/vendors/index.json')]);
  const detected = detectStack(m, doc || {});
  const fw = typeof framework === 'string' ? framework.toLowerCase() : detectFramework(m);
  const covered = (index?.ecosystems || []).filter((e) => e.status !== 'planned').map((e) => e.slug);
  const listings = Object.fromEntries((vendors?.vendors || []).map((v) => [v.id, v.integrations || []]));
  const input = { apps: detected, platforms: [], ...(fw ? { framework: fw } : {}) };
  const ids = [...new Set(stackPairs(input, { listings, covered }).pairs.flatMap((p) => p.ids))];
  const records = (await Promise.all(ids.map((id) => get(`/api/integrations/${id.split('--')[1]}/${id.split('--')[0]}.json`)))).filter(Boolean);
  const res = stackCheck(input, { records, listings, covered, limits: limitsDoc?.limits || [], names: Object.fromEntries((index?.ecosystems || []).map((e) => [e.slug, e.name])) }, stackOverlap);
  let text = `Read: ${found.join(', ')}\n` + formatStack(res, detected);
  if (share) {
    const body = { platforms: detected.filter((d) => d.platform).map((d) => d.platform), apps: detected.filter((d) => !d.platform).map((d) => d.id), ...(fw ? { framework: fw } : {}) };
    const r = await post('/v1/feedback/stack-manifest', body);
    text += r.recorded ? '\n\nShared with Lode (the user agreed): the app and platform codes found, and the framework.' : `\n\nLode did not record the stack${r.message ? `: ${r.message}` : ''}.`;
  } else text += '\n\nNot sent to Lode. Only if the user agrees to share the app and platform codes anonymously, run this again with --share.';
  return text;
}


// Integration Triage (LOD-165): fixed symptom codes, kept equal to SYMPTOM_CODES in src/lib/triage.mjs by tests/triage.test.mjs
export const SYMPTOM_CODES = ["credential-invalid", "token-expired", "scope-missing", "authorize-failed", "access-filtered", "platform-plan-required", "app-plan-required", "account-restricted", "rate-limited", "request-too-large", "runtime-limit-exceeded", "config-missing", "package-not-found", "package-incompatible", "capability-missing", "validation-rejected", "data-mismatch", "webhook-not-received", "webhook-signature-failed", "event-duplicate-or-out-of-order", "api-deprecated", "region-unavailable", "connection-failed", "setup-step-missing", "service-outage", "mcp-connect-failed", "mcp-tool-error", "other"];
export const TRIAGE_OUTCOMES = ['fixed', 'switched', 'gave-up'];

async function triageCmd(app, platform, opts) {
  const eco = platformSlug(platform);
  if (!eco) return `Lode does not cover "${platform}" yet. Platforms covered: ${Object.keys(PLATFORMS).join(', ')}.`;
  if (!SYMPTOM_CODES.includes(opts.symptom)) return `Give one symptom code with --symptom: ${SYMPTOM_CODES.join(', ')}`;
  const q = new URLSearchParams({ app, platform: eco, symptom: opts.symptom });
  if (typeof opts.status === 'string' && /^[1-5]\d\d$/.test(opts.status)) q.set('http_status', opts.status);
  if (typeof opts.object === 'string') q.set('object', opts.object);
  const share = opts.share === true && TRIAGE_OUTCOMES.includes(opts.outcome);
  if (share) { q.set('outcome', opts.outcome); q.set('share', 'true'); if (typeof opts.switched === 'string') q.set('switched_to', opts.switched); }
  const sent = `Sent to Lode: app "${app}", platform ${eco}, symptom ${opts.symptom}${q.get('http_status') ? `, status class ${q.get('http_status')[0]}xx` : ''}${share ? `, outcome ${opts.outcome} (the user agreed)` : ''}. No error text, logs or code.`;
  const body = await get(`/v1/triage?${q}`);
  if (!body || body.found === false) return `${sent}\n${body?.not_documented || `Lode has no record for "${app}" on ${eco}. Not documented is not the same as not supported.`}`;
  const out = [`${body.app} on ${body.platform}: ${body.symptom} (${body.symptom_label})`, body.url ? `Lode page: ${body.url} | verified ${body.last_verified || 'unknown'}` : ''];
  for (const f of body.facts || []) out.push(`- ${f.text}${(f.sources || []).length ? ` [${f.sources.join(' ')}]` : ''}`);
  for (const i of body.incidents || []) out.push(`- Status page: ${i.name} (${i.status}, ${String(i.at).slice(0, 10)}) ${i.link}`);
  if (body.incidents_note) out.push(body.incidents_note);
  for (const a of body.alternatives || []) out.push(`- Also documents it on ${body.platform}: ${a.app} ${a.url || ''}`);
  if (body.not_documented) out.push(body.not_documented);
  out.push(sent);
  if (opts.outcome && !share) out.push('The outcome was not sent. Only if the user agrees to share it anonymously, run this again with --share.');
  return out.filter(Boolean).join('\n');
}

// lode init (Paul approved 27-11-2026): put Lode in the project's own config so teammates and sub-agents have it.
// Runs only when someone types it, shows the exact files first, writes only with --yes, changes no other entry,
// adds no code or hooks, sends nothing to Lode, and `init --remove` undoes it.
const LODE_URL = 'https://trylode.io/mcp';
async function initCmd({ client = 'all', yes = false, remove = false } = {}) {
  const fs = await import('node:fs'); const path = await import('node:path'); const url = await import('node:url'); const os = await import('node:os'); const crypto = await import('node:crypto');
  const cwd = fs.realpathSync(process.cwd());
  // Only inside a project: never the home folder or the root, and only where a project marker exists (security review 27-11-2026)
  if (cwd === path.parse(cwd).root || cwd === fs.realpathSync(os.homedir())) return 'lode init only runs inside a project folder, not your home folder or the root. Nothing was written.';
  const MARKERS = ['.git', 'package.json', 'pyproject.toml', 'go.mod', 'Gemfile', 'requirements.txt', 'Cargo.toml', 'deno.json', 'composer.json'];
  if (!MARKERS.some((m) => fs.existsSync(path.join(cwd, m)))) return `lode init didn't find a project here (none of ${MARKERS.join(', ')}). Run it from the project's root folder. Nothing was written.`;
  // A target is safe only when it and every folder between it and the project are real (not symlinks)
  const safe = (rel) => { let p = cwd; for (const part of rel.split(/[\\/]/)) { p = path.join(p, part); try { if (fs.lstatSync(p).isSymbolicLink()) return false; } catch { return true; } } return true; };
  const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const markerRel = path.join('.claude', 'lode-init.json');
  const markerFile = path.join(cwd, markerRel);
  if (!safe(markerRel)) return `${markerRel}: .claude or the file is a link, so lode init won't write there. Nothing was written.`;
  let marker = { added: [], skill_files: {} };
  try { marker = JSON.parse(fs.readFileSync(markerFile, 'utf8')); } catch { /* none yet */ }
  const targets = [];
  if (client === 'all' || client === 'claude') targets.push({ file: '.mcp.json', entry: { type: 'http', url: LODE_URL } });
  if (client === 'all' || client === 'cursor') targets.push({ file: path.join('.cursor', 'mcp.json'), entry: { url: LODE_URL } });
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const skillSrc = path.resolve(here, '..');
  const skillRel = path.join('.claude', 'skills', 'lode-integration-check');
  const skillDst = path.join(cwd, skillRel);
  const SKILL_FILES = ['SKILL.md', 'PERMISSIONS.md', path.join('scripts', 'lode.mjs')];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const plan = [], refused = [];
  for (const t of targets) {
    const f = path.join(cwd, t.file);
    if (!safe(t.file)) { refused.push(`${t.file}: it or a folder above it is a link, so lode init won't touch it.`); continue; }
    let text = null, cur = {};
    try { text = fs.readFileSync(f, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') { refused.push(`${t.file}: can't be read (${e.code}).`); continue; } }
    if (text != null) {
      try { cur = JSON.parse(text); } catch { cur = undefined; }
      if (!cur || typeof cur !== 'object' || Array.isArray(cur) || (cur.mcpServers != null && (typeof cur.mcpServers !== 'object' || Array.isArray(cur.mcpServers)))) {
        refused.push(`${t.file}: not plain JSON that lode init can safely edit (comments, trailing commas or another shape). Add this entry by hand under "mcpServers": "lode": ${JSON.stringify(t.entry)}`); continue;
      }
    }
    const indent = (text?.match(/\n([ \t]+)"/) || [])[1] || 2;
    const has = cur.mcpServers && Object.prototype.hasOwnProperty.call(cur.mcpServers, 'lode');
    const ours = (marker.added || []).find((a) => a.file === t.file);
    if (remove) {
      if (has && (same(cur.mcpServers.lode, t.entry) || (ours && same(cur.mcpServers.lode, ours.entry)))) plan.push({ do: 'remove', file: t.file, f, cur, indent, created: !!ours?.created });
      else if (has) refused.push(`${t.file}: its "lode" entry isn't the one lode init adds, so it was left alone.`);
    } else if (!has) plan.push({ do: 'add', file: t.file, f, cur, indent, entry: t.entry, created: text == null });
  }
  const skillThere = fs.existsSync(path.join(skillDst, 'SKILL.md'));
  if (!safe(skillRel)) refused.push(`${skillRel}: it or a folder above it is a link, so lode init won't touch it.`);
  else if (remove && Object.keys(marker.skill_files || {}).length) plan.push({ do: 'remove-skill', file: skillRel });
  else if (!remove && !skillThere && path.resolve(skillSrc) !== path.resolve(skillDst)) plan.push({ do: 'copy-skill', file: skillRel });
  const refusedText = refused.length ? `\nNot changed:\n${refused.map((r) => `  ${r}`).join('\n')}` : '';
  if (!plan.length) return (remove ? 'Nothing to remove that lode init added.' : 'Lode is already set up in this project.') + refusedText;
  const lines = plan.map((p) => p.do === 'add' ? `  ${p.file}: ${p.created ? 'create it with' : 'add'} one entry "lode" -> ${LODE_URL}${p.created ? '' : ' (other entries unchanged)'}`
    : p.do === 'remove' ? `  ${p.file}: remove the "lode" entry lode init added (other entries unchanged)${p.created ? '; delete the file if nothing else is left in it' : ''}`
    : p.do === 'copy-skill' ? `  ${p.file}/: copy the Lode Integration Check skill (SKILL.md, PERMISSIONS.md, scripts/lode.mjs; no dependencies, nothing runs on install)`
    : `  ${p.file}/: delete the skill files lode init copied, if unchanged`);
  if (!remove) lines.push(`  ${markerRel}: a small note of what lode init added, so --remove undoes only that`);
  if (!yes) return `lode init would ${remove ? 'change' : 'write'} these files in ${cwd}:\n${lines.join('\n')}${refusedText}\nNothing has been written and nothing is sent to Lode. If the user agrees, run: node lode.mjs init${remove ? ' --remove' : ''}${client !== 'all' ? ` --client ${client}` : ''} --yes`;
  const write = (p, next) => {
    fs.writeFileSync(p.f, JSON.stringify(next, null, p.indent) + '\n');
    // Check afterwards that every other entry is exactly as it was
    const back = JSON.parse(fs.readFileSync(p.f, 'utf8'));
    for (const k of Object.keys(p.cur)) if (k !== 'mcpServers' && !same(back[k], p.cur[k])) throw new Error(`${p.file} changed unexpectedly`);
    for (const k of Object.keys(p.cur.mcpServers || {})) if (k !== 'lode' && !same(back.mcpServers?.[k], p.cur.mcpServers[k])) throw new Error(`${p.file} changed unexpectedly`);
  };
  for (const p of plan) {
    if (p.do === 'add') {
      fs.mkdirSync(path.dirname(p.f), { recursive: true });
      write(p, { ...p.cur, mcpServers: { ...(p.cur.mcpServers || {}), lode: p.entry } });
      marker.added = [...(marker.added || []).filter((a) => a.file !== p.file), { file: p.file, created: p.created, entry: p.entry }];
    }
    if (p.do === 'remove') {
      const next = { ...p.cur, mcpServers: { ...p.cur.mcpServers } }; delete next.mcpServers.lode;
      if (p.created && !Object.keys(next.mcpServers).length && Object.keys(next).length === 1) fs.rmSync(p.f); else write(p, next);
      marker.added = (marker.added || []).filter((a) => a.file !== p.file);
    }
    if (p.do === 'copy-skill') {
      marker.skill_files = {};
      for (const rel of SKILL_FILES) {
        const from = path.join(skillSrc, rel), to = path.join(skillDst, rel);
        if (!fs.existsSync(from)) continue;
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
        marker.skill_files[rel] = hash(to);
      }
    }
    if (p.do === 'remove-skill') {
      // Delete only the files lode init copied and nobody has changed; keep the folder if anything else is in it
      for (const [rel, h] of Object.entries(marker.skill_files || {})) { const f = path.join(skillDst, rel); try { if (hash(f) === h) fs.rmSync(f); } catch { /* already gone */ } }
      for (const d of [path.join(skillDst, 'scripts'), skillDst]) { try { if (!fs.readdirSync(d).length) fs.rmdirSync(d); } catch { /* not empty or gone */ } }
      marker.skill_files = {};
    }
  }
  if ((marker.added || []).length || Object.keys(marker.skill_files || {}).length) { fs.mkdirSync(path.dirname(markerFile), { recursive: true }); fs.writeFileSync(markerFile, JSON.stringify(marker, null, 2) + '\n'); }
  else { try { fs.rmSync(markerFile); } catch { /* none */ } }
  return `${remove ? 'Removed' : 'Done'}:\n${lines.join('\n')}${refusedText}\n${remove ? '' : 'Commit these files so teammates and sub-agents in this project have Lode. Undo with: node lode.mjs init --remove --yes\n'}Nothing was sent to Lode.`;
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  const flag = (n) => { const i = rest.indexOf(n); if (i < 0) return undefined; const v = rest[i + 1]; rest.splice(i, v && !v.startsWith('--') ? 2 : 1); return v && !v.startsWith('--') ? v : true; };
  if (cmd === 'check' && rest[0]) return check(rest[0], rest[1]);
  if (cmd === 'list' && rest[0]) {
    const category = flag('--category'), all = flag('--all');
    const eco = platformSlug(rest[0]);
    if (!eco) return `Lode does not cover "${rest[0]}" yet. Platforms covered: ${Object.keys(PLATFORMS).join(', ')}.`;
    const index = await get(`/api/ecosystems/${eco}.json`);
    return formatList(index, index.integrations || [], { category: typeof category === 'string' ? category : undefined, all: !!all });
  }
  if (cmd === 'find' && rest[0]) {
    const opts = { category: flag('--category'), needs: flag('--needs'), region: flag('--region'), stack: flag('--stack'), framework: flag('--framework') };
    const { eco, index } = await platformIndex(rest[0]);
    const q = new URLSearchParams({ ecosystem: eco, limit: '10' });
    const category = categoryFor(typeof opts.category === 'string' ? opts.category : undefined, index.integrations || []);
    if (opts.category && !category) {
      // Agents often pass the other product as a category ("shopify" on Xero): point them to check
      // Only an exact app name or id counts ("postgres" must not be read as Prisma Postgres)
      const asApp = matchApp(opts.category, (index.integrations || []).map((i) => ({ ...i, name: i.app })))
        .filter((e) => norm(e.name) === norm(opts.category) || String(e.id).split('--')[0] === slugish(opts.category));
      if (asApp.length === 1 || platformSlug(opts.category)) return `"${opts.category}" is a product, not a category. For that pair, run: node lode.mjs check "${asApp[0]?.name || opts.category}" ${eco}`;
    }
    if (opts.category && !category) return `No category on ${index.name} matches "${opts.category}". Categories: ${[...new Set((index.integrations || []).flatMap((i) => i.categories || []))].sort().join(', ')}`;
    if (category) q.set('category', category);
    for (const k of ['needs', 'region', 'stack', 'framework']) if (typeof opts[k] === 'string') q.set(k, opts[k]);
    return formatFind(await get(`/v1/integrations?${q}`), index.name);
  }
  if (cmd === 'chose' && rest[1]) {
    const opts = { considered: flag('--considered'), reason: flag('--reason'), needs: flag('--needs'), region: flag('--region'), share: flag('--share') };
    const { eco, index } = await platformIndex(rest[1]);
    const chosen = idFor(rest[0], index);
    const considered = (list(opts.considered) || []).map((a) => idFor(a, index));
    const reason = CHOICE_REASONS.includes(opts.reason) ? opts.reason : 'other';
    // 22-11-2026 (Paul): nothing goes to Lode unless the user agreed and the agent added --share
    let text;
    if (opts.share === true) {
      const r = await post('/v1/feedback/choice', { chosen, considered, reason, needs: list(opts.needs), region: typeof opts.region === 'string' ? opts.region : undefined });
      text = r.recorded ? `Sent to Lode (the user agreed): chose ${chosen} (reason: ${reason}). Thank you; this helps keep the facts useful.` : `Lode did not record the choice${r.message ? `: ${r.message}` : ''}.`;
    } else {
      text = `Not sent to Lode. Only if the user agrees to tell Lode anonymously which app they chose, run this again with --share.`;
    }
    // D51: keep the choice locally too (only for a real Lode record), so `recheck` can say what changed later
    return chosen === 'none' ? text : text + await saveChoice(eco, chosen);
  }
  if (cmd === 'outcome' && rest[2]) {
    const opts = { failure: flag('--failure-reason'), switched: flag('--switched-to'), share: flag('--share') };
    const { index } = await platformIndex(rest[1]);
    const chosen = idFor(rest[0], index);
    const outcome = OUTCOMES.includes(rest[2]) ? rest[2] : null;
    if (!outcome) return `Outcome must be one of: ${OUTCOMES.join(', ')}`;
    const body = { chosen, considered: [chosen], outcome };
    if (typeof opts.failure === 'string') body.failure_reason = FAILURE_REASONS.includes(opts.failure) ? opts.failure : 'other';
    if (typeof opts.switched === 'string') { try { body.switched_to = idFor(opts.switched, index); } catch { body.switched_to = opts.switched; } }
    if (opts.share !== true) return `Not sent to Lode. Only if the user agrees to tell Lode anonymously how the integration went, run this again with --share.`;
    const r = await post('/v1/feedback/choice', body);
    return r.recorded ? `Sent to Lode (the user agreed): ${chosen} ${outcome}.` : `Lode did not record the outcome${r.message ? `: ${r.message}` : ''}.`;
  }
  if (cmd === 'request' && rest[1]) {
    const opts = { needs: flag('--needs'), region: flag('--region') };
    const eco = platformSlug(rest[1]);
    if (!eco) return `Lode does not cover "${rest[1]}" yet. Platforms covered: ${Object.keys(PLATFORMS).join(', ')}.`;
    const r = await post('/v1/feedback/coverage', { app: rest[0], ecosystem: eco, needs: list(opts.needs), region: typeof opts.region === 'string' ? opts.region : undefined, reason: 'not-covered' });
    if (r.already_covered) return `Lode already covers this: ${r.id}. Run: node lode.mjs check "${rest[0]}" ${eco}`;
    return r.recorded ? `Recorded with Lode: ${rest[0]} on ${eco} is wanted. Lode uses these requests to decide what to research next.` : `Lode did not record the request${r.message ? `: ${r.message}` : ''}.`;
  }
  if (cmd === 'overlap' && rest[0]) {
    const opts = { apps: flag('--apps'), region: flag('--region'), share: flag('--share') };
    const apps = list(typeof opts.apps === 'string' ? opts.apps : undefined) || [];
    if (apps.length < 2) return 'Give two or more apps: node lode.mjs overlap <platform> --apps "A,B"';
    return overlap(rest[0], apps, { region: opts.region, share: opts.share === true });
  }
  if (cmd === 'recheck') return recheck({ share: flag('--share') === true });
  if (cmd === 'drop' && rest[1]) {
    const opts = { reason: flag('--reason'), switched: flag('--switched-to'), share: flag('--share') };
    return drop(rest[0], rest[1], { reason: opts.reason, switched: opts.switched, share: opts.share === true });
  }
  if (cmd === 'adr' && (rest[0] || rest.includes('--update'))) {
    const opts = { update: flag('--update'), considered: flag('--considered'), chose: flag('--chose'), reason: flag('--reason'), status: flag('--status'), constraint: flag('--constraint'), workaround: flag('--workaround'), share: flag('--share') };
    return adr(rest[0], opts);
  }
  if (cmd === 'stack') {
    const opts = { framework: flag('--framework'), share: flag('--share') };
    return stack({ framework: opts.framework, share: opts.share === true });
  }
  if (cmd === 'triage' && rest[1]) {
    const opts = { symptom: flag('--symptom'), status: flag('--status'), object: flag('--object'), outcome: flag('--outcome'), switched: flag('--switched-to'), share: flag('--share') };
    return triageCmd(rest[0], rest[1], opts);
  }
  if (cmd === 'init') {
    const opts = { client: flag('--client'), yes: flag('--yes'), remove: flag('--remove') };
    const client = ['claude', 'cursor', 'all'].includes(opts.client) ? opts.client : 'all';
    return initCmd({ client, yes: opts.yes === true, remove: opts.remove === true });
  }
  if (cmd === 'platforms') return `Lode covers: ${Object.keys(PLATFORMS).join(', ')}. Facts are source-linked and dated; see https://trylode.io/methodology/`;
  return 'Usage:\n  node lode.mjs check <app> [platform]\n  node lode.mjs triage <app> <platform> --symptom <code> [--status 429] [--object o]\n  node lode.mjs init [--client claude|cursor|all] [--yes] [--remove]\n  node lode.mjs find <platform> [--category c] [--needs a,b] [--region XX] [--stack a,b] [--framework f]\n  node lode.mjs list <platform> [--category <c>] [--all]\n  node lode.mjs chose <app|none> <platform> [--considered "A,B"] [--reason code] [--share]\n  node lode.mjs outcome <app> <platform> <integrated|failed|abandoned|not-tried> [--failure-reason code] [--share]\n  node lode.mjs request <app> <platform> [--needs a,b] [--region XX]\n  node lode.mjs overlap <platform> --apps "A,B,C" [--region XX] [--share]\n  node lode.mjs recheck [--share]\n  node lode.mjs drop <app> <platform> [--reason code] [--switched-to <app>] [--share]\n  node lode.mjs adr <platform> --considered "A,B" --chose B [--reason code] [--status s] [--constraint a,b] [--workaround a,b] [--share]\n  node lode.mjs adr --update <file> [--status s] [--constraint a,b] [--workaround a,b] [--share]\n  node lode.mjs stack [--framework f] [--share]\n  node lode.mjs platforms';
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('lode.mjs')) {
  main(process.argv.slice(2)).then((t) => console.log(t)).catch((e) => { console.error(`Lode check failed: ${e.message}. Say that Lode could not be reached; do not guess the facts.`); process.exit(1); });
}
