// A claimed Frequent Eater card (Grind tab, All time), passed on to Rimmah's private #claims channel on Discord.
// A Cloudflare Pages Function at /api/claim, beside report.js, with its own secret DISCORD_CLAIMS_WEBHOOK_URL.
// Design: docs/superpowers/specs/2026-11-15-all-time-views-eater-card-design.md.
//
// The page posts JSON { token, card_no } after the claim row saved (supabase/eater-claims.sql). Nothing else the page says is
// used: the row is read back from Supabase with the player's own token, so only a claim that exists gets posted, and only with
// the numbers the database counted. The answer is { ok: true } or { error }; the page ignores both, the claim stands either way.
import { SUPABASE_URL, SUPABASE_ANON_KEY, allowed, cors, whoIs } from './report.js';

export const CAPS = { perHour: 5, freshMs: 600000, posted: 5000 };
// ip -> tries in the last hour, and the claims already posted. Per Cloudflare isolate, so both are best effort.
export const LIMITS = new Map();
export const POSTED = new Set();
const HOUR = 3600000;
// the same numbers as CLAIM_CAP and looksOff in grind-alltime.js
const CLAIM_CAP = 20;
const looksOff = c => c.per_hour >= 0.8 * CLAIM_CAP * 60 || c.top3 > c.eaten / 2;
const NAME = 'Six Path Crossway';
const COLOR = { lemon: 0xF2C230, meat: 0xC96A4A, off: 0xE0525A };
const SAY = {
  origin: 'Claims only come from the site.',
  notClaim: "That isn't a claim.",
  slow: 'Too many tries. Give it a little while.',
  notSetUp: "Claims aren't set up yet.",
  who: 'Sign in again.',
  none: 'No such claim.',
  old: 'That claim was already passed on.',
  discord: "Couldn't reach Discord.",
};
const answer = (status, body, origin) => Response.json(body, { status, headers: origin ? cors(origin) : {} });
const num = n => Math.round(Number(n) || 0).toLocaleString('en-US');
const field = (name, value) => ({ name, value: String(value).slice(0, 1024) || '?', inline: true });

// One claim as one Discord message. row is the database's own row; who is the Discord account the token belongs to.
export function buildClaim(row, who) {
  const off = looksOff(row), what = row.reward === 'meat' ? 'Meat' : 'Lemons';
  const when = Date.parse(row.created_at);
  const fields = [
    field('Discord', who.name), field('Character', row.ign), field('Card', 'no. ' + row.card_no),
    field('Wants', '100 ' + what), field('Checked total', num(row.eaten) + ' eaten'), field('Hours tracked', (Number(row.hours) || 0).toFixed(1)),
    field('Runs', num(row.runs)), field('Potions an hour', num(row.per_hour)),
    field('When', Number.isFinite(when) ? '<t:' + Math.floor(when / 1000) + ':f>' : 'unknown'),
  ];
  if (off) fields.push(field('Looks off', row.per_hour >= 0.8 * CLAIM_CAP * 60 ? 'Drinking close to the speed limit' : 'Most of it came from three runs'));
  let title = 'Frequent Eater card · ' + row.ign + ' · 100 ' + what;
  if (title.length > 256) title = title.slice(0, 255) + '…';
  return { username: NAME, allowed_mentions: { parse: [] },   // nothing a player types can ping anyone
    embeds: [{ title, color: off ? COLOR.off : COLOR[row.reward] || COLOR.lemon, fields,
      footer: { text: who.discordId ? 'Discord id ' + who.discordId : 'Signed in' } }] };
}

export async function handleClaim(request, env, deps = {}) {
  const fetchFn = deps.fetch || ((...a) => fetch(...a)), now = deps.now || Date.now, limits = deps.limits || LIMITS, posted = deps.posted || POSTED;
  const origin = request.headers.get('Origin');
  if (!allowed(origin)) return answer(403, { error: SAY.origin }, null);
  const say = (status, error) => answer(status, { error }, origin);
  if (!env || !env.DISCORD_CLAIMS_WEBHOOK_URL) return say(500, SAY.notSetUp);

  let body;
  try { body = JSON.parse((await request.text()).slice(0, 10000)); } catch (e) { return say(400, SAY.notClaim); }
  const token = body && body.token, cardNo = body && body.card_no;
  if (typeof token !== 'string' || !token || token.length > 5000 || !Number.isInteger(cardNo) || cardNo < 1 || cardNo > 100000) return say(400, SAY.notClaim);

  // five tries an hour from one place
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown', t = now();
  const recent = (limits.get(ip) || []).filter(x => t - x < HOUR);
  if (recent.length >= CAPS.perHour) { limits.set(ip, recent); return say(429, SAY.slow); }
  limits.set(ip, recent.concat(t));
  if (limits.size > 2000) for (const [k, v] of limits) if (!v.some(x => t - x < HOUR)) limits.delete(k);

  const who = await whoIs(token, fetchFn);
  if (!who) return say(401, SAY.who);
  // the player's own token, so the database's rules hand back only their own claim
  let row = null;
  try {
    const r = await fetchFn(SUPABASE_URL + '/rest/v1/eater_claims?card_no=eq.' + cardNo + '&select=user_id,card_no,reward,ign,eaten,hours,runs,per_hour,top3,created_at&limit=1',
      { headers: { apikey: SUPABASE_ANON_KEY, authorization: 'Bearer ' + token } });
    const rows = r.ok ? await r.json() : null;
    if (Array.isArray(rows) && rows[0] && typeof rows[0] === 'object') row = rows[0];
  } catch (e) { row = null; }
  if (!row) return say(404, SAY.none);
  // a claim is passed on once, soon after it's made: an old one, or one this isolate already posted, posts nothing
  const made = Date.parse(row.created_at), key = row.user_id + ':' + row.card_no;
  if (!Number.isFinite(made) || t - made > CAPS.freshMs || posted.has(key)) return say(409, SAY.old);
  posted.add(key);
  if (posted.size > CAPS.posted) posted.delete(posted.values().next().value);

  let sent = false;
  try {
    const hook = String(env.DISCORD_CLAIMS_WEBHOOK_URL).trim();
    const r = await fetchFn(hook + (hook.includes('?') ? '&' : '?') + 'wait=true',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(buildClaim(row, who)) });
    if (!r.ok) console.error('discord said', r.status, (await r.text().catch(() => '')).slice(0, 300));
    sent = r.ok;
  } catch (e) { console.error('discord unreachable', (e && e.name) || 'error'); }
  if (!sent) { posted.delete(key); return say(502, SAY.discord); }   // nothing was sent, so the page's next try may
  return answer(200, { ok: true }, origin);
}

export const onRequestPost = ({ request, env }) => handleClaim(request, env);
export function onRequestOptions({ request }) {
  const origin = request.headers.get('Origin');
  if (!allowed(origin)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: Object.assign(cors(origin), {
    'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'Content-Type', 'access-control-max-age': '86400' }) });
}
