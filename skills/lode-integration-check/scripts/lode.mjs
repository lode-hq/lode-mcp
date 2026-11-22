#!/usr/bin/env node
// Lode Integration Check: verified, source-linked facts about how one product works with another
// (Xero, QuickBooks Online, HubSpot, Shopify, Stripe, Supabase, Vercel, Netlify, n8n), read from Lode's
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
// Nothing else from your project, prompt or machine is sent; no free text. https://trylode.io/privacy/
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BASE = (process.env.LODE_BASE || 'https://trylode.io').replace(/\/$/, '');
const UA = process.env.LODE_UA || 'lode-skill/0.1 (+https://trylode.io/agents/)';

export const NAMES = { xero: 'Xero', 'quickbooks-online': 'QuickBooks Online', hubspot: 'HubSpot', shopify: 'Shopify', stripe: 'Stripe', supabase: 'Supabase', vercel: 'Vercel', netlify: 'Netlify', n8n: 'n8n' };
export const PLATFORMS = {
  xero: ['xero'],
  'quickbooks-online': ['quickbooks-online', 'quickbooks', 'qbo', 'quickbooks online', 'intuit quickbooks'],
  hubspot: ['hubspot'],
  shopify: ['shopify'],
  stripe: ['stripe'],
  supabase: ['supabase'],
  vercel: ['vercel'],
  netlify: ['netlify'],
  n8n: ['n8n', 'n8n.io'],
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
    for (const pl of p.plans || []) out.push(`- ${pl.name}${pl.billing ? ` (${pl.billing})` : ''}: ${money(pl.prices) || pl.rate || 'no published amount'}${pl.per ? `, ${pl.per}` : ''} [${cite(pl.src).join(' ')}]`);
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
  const plans = (p.plans || []).map((pl) => `${pl.name}${pl.billing ? ` (${pl.billing})` : ''}: ${money(pl.prices) || pl.rate || 'no published amount'}`);
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
  let text = `Marked ${id} as ${it.state}${it.switched_to ? ` for ${it.switched_to}` : ''}${it.reason ? ` (reason: ${it.reason})` : ''} in ${LOCAL_FILE}. Nothing was sent.`;
  if (unresolved) text += `\n"${unresolved}" is not in Lode on ${index.name}; it was not recorded. If the user agrees, tell Lode: node lode.mjs request "${unresolved}" ${eco}`;
  if (it.switched_to) text += `\nTo track the new integration too: node lode.mjs chose "${switched}" ${eco} (saves locally; add --share only if the user agrees)`;
  if (share) {
    const r = await post('/v1/feedback/retention', { project: f.project, platform: eco, items: retentionPayload(f, eco).items.filter((x) => x.id === id) });
    text = text.replace(' Nothing was sent.', '') + (r.recorded ? '\nShared with Lode: the project code, this integration\'s Lode id, its new state, the reason code and how many days it was kept.' : `\nLode did not record it${r.message ? `: ${r.message}` : ''}.`);
  }
  return text;
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
  if (cmd === 'platforms') return `Lode covers: ${Object.keys(PLATFORMS).join(', ')}. Facts are source-linked and dated; see https://trylode.io/methodology/`;
  return 'Usage:\n  node lode.mjs check <app> [platform]\n  node lode.mjs find <platform> [--category c] [--needs a,b] [--region XX] [--stack a,b] [--framework f]\n  node lode.mjs list <platform> [--category <c>] [--all]\n  node lode.mjs chose <app|none> <platform> [--considered "A,B"] [--reason code] [--share]\n  node lode.mjs outcome <app> <platform> <integrated|failed|abandoned|not-tried> [--failure-reason code] [--share]\n  node lode.mjs request <app> <platform> [--needs a,b] [--region XX]\n  node lode.mjs overlap <platform> --apps "A,B,C" [--region XX] [--share]\n  node lode.mjs recheck [--share]\n  node lode.mjs drop <app> <platform> [--reason code] [--switched-to <app>] [--share]\n  node lode.mjs platforms';
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('lode.mjs')) {
  main(process.argv.slice(2)).then((t) => console.log(t)).catch((e) => { console.error(`Lode check failed: ${e.message}. Say that Lode could not be reached; do not guess the facts.`); process.exit(1); });
}
