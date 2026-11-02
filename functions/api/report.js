// Something off? reports from the site, passed on to Rimmah's private #bug-reports channel on Discord.
// A Cloudflare Pages Function at /api/report: it ships with the site (boss-timer/functions goes into the six-path-crossway
// repo) and reads the webhook from the DISCORD_WEBHOOK_URL secret, so the link never reaches a visitor. Design:
// docs/superpowers/specs/2026-11-02-flag-button-design.md.
//
// The page posts a multipart form: kind (wrong or idea), text, details (JSON), token (signed in only), and the pictures
// page (JPEG), popout and game (PNG). The answer is { ok: true } or { error } with words the panel shows as they are.

// The same project and public key the page carries in CONFIG; the database rules are what protect the data.
const SUPABASE_URL = 'https://umnomoiwjtaorvljisqu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtbm9tb2l3anRhb3J2bGppc3F1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwNTkyODUsImV4cCI6MjEwODYzNTI4NX0.43QM25wqDaU5XIcZ235_A0UiMT_EmcUMCOumICu4fyY';

// Bytes, except text (characters). A Discord webhook message tops out around 10 MB, so one message stays under 9.
export const CAPS = { text: 1000, details: 200000, page: 2000000, popout: 1000000, game: 9000000, message: 9000000, perHour: 5 };
// ip -> send times in the last hour. Per Cloudflare isolate, so it's best effort: enough to stop one person hammering Send.
export const LIMITS = new Map();
const HOUR = 3600000;
const TABS = { timer: 'Timer tab', builds: 'Builds tab', appraiser: 'Appraiser tab', grind: 'Grind tab', how: 'How it works page' };
const COLOR = { wrong: 0xE0525A, idea: 0x6CBF3F };
const NAME = 'Six Path Crossway';
const NO_PINGS = { parse: [] };   // nothing a reporter types can ping @everyone or anyone else
const SAY = {
  origin: 'Reports only come from the site.',
  notReport: "That isn't a report.",
  tooLong: "That's more than 1,000 characters.",
  tooBig: 'That report is too big to send.',
  slow: "You've sent a few already. Try again in a little while.",
  notSetUp: "Reports aren't set up yet.",
  discord: "Couldn't reach Discord. Try again in a minute.",
};

// sixpathcrossway.pages.dev, its preview deploys, and the GitHub Pages copy
function allowed(origin) {
  if (!origin) return false;
  let u;
  try { u = new URL(origin); } catch (e) { return false; }
  if (u.protocol !== 'https:' || u.origin !== origin) return false;
  const h = u.hostname;
  return h === 'sixpathcrossway.pages.dev' || h.endsWith('.sixpathcrossway.pages.dev') || h === 'drim1561.github.io';
}
const cors = origin => ({ 'access-control-allow-origin': origin, vary: 'Origin' });
const answer = (status, body, origin) => Response.json(body, { status, headers: origin ? cors(origin) : {} });

// The name the site shows for a signed in player, the same order as the page's who(); null when the token is no good.
async function whoIs(token, fetchFn) {
  if (!token) return null;
  try {
    const r = await fetchFn(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_ANON_KEY, authorization: 'Bearer ' + token } });
    if (!r.ok) return null;
    const m = (await r.json()).user_metadata || {};
    const name = (m.custom_claims && m.custom_claims.global_name) || m.full_name || m.name;
    return name ? { name: String(name), discordId: m.provider_id || m.sub || null } : null;
  } catch (e) { return null; }
}

function browserOf(ua) {
  const s = String(ua || '');
  for (const [re, name] of [[/Edg\/(\d+)/, 'Edge'], [/OPR\/(\d+)/, 'Opera'], [/Firefox\/(\d+)/, 'Firefox'], [/Chrome\/(\d+)/, 'Chrome'], [/Version\/(\d+)[^ ]* .*Safari/, 'Safari']]) {
    const m = s.match(re);
    if (m) return name + ' ' + m[1];
  }
  return 'Unknown browser';
}
const field = (name, value) => ({ name, value: String(value).slice(0, 1024) || '?', inline: true });
const mb = n => (n / 1e6).toFixed(1) + ' MB';

// One report as Discord messages: the report itself, then the game frame on its own when both don't fit in one. A frame
// too big for one message (an ultrawide window) comes from the page as up to four lossless strips, left to right
// (game, game2, game3, game4): the first rides with the report when it fits, each later one gets its own message.
const STRIPS = ['game', 'game2', 'game3', 'game4'];
export function buildMessages({ kind, text, details, who, files, commit }) {
  const { page, popout } = files || {};
  const strips = STRIPS.map(k => (files || {})[k]).filter(Boolean);
  let title = (kind === 'idea' ? 'Idea · ' : '') + (TABS[details.tab] || 'Site') + ' · from ' + (who ? who.name : 'someone');
  if (title.length > 256) title = title.slice(0, 255) + '…';
  const w = Array.isArray(details.window) ? details.window : null;
  const errors = Array.isArray(details.errors) ? details.errors : [];
  const when = Date.parse(details.when);
  const fields = [
    field('Browser', browserOf(details.browser) + (w ? ', ' + w[0] + '×' + w[1] : '')),
    field('Version', String(details.version || 'unknown') + (commit ? ' (commit ' + String(commit).slice(0, 7) + ')' : '')),
    field('Errors', errors.length ? errors.length + ', first: ' + String((errors[0] && errors[0].msg) || '').slice(0, 100) : 'none'),
    field('When', Number.isFinite(when) ? '<t:' + Math.floor(when / 1000) + ':f>' : 'unknown'),
  ];
  const detailsFile = new File([JSON.stringify(details, null, 2)], 'details.json', { type: 'application/json' });
  const first = [page && { name: 'page.jpg', blob: page }, popout && { name: 'popout.png', blob: popout }].filter(Boolean);
  const later = [];
  if (strips.length) {
    const n = strips.length, notes = [];
    let size = first.reduce((s, f) => s + f.blob.size, detailsFile.size);
    strips.forEach((g, i) => {
      const part = { name: i ? 'game-' + (i + 1) + '.png' : 'game.png', blob: g,
        content: 'Game frame for the report above' + (n > 1 ? ', strip ' + (i + 1) + ' of ' + n + ' (left to right)' : '') };
      if (g.size > CAPS.game) notes.push((n > 1 ? 'strip ' + (i + 1) + ' ' : '') + 'too big to send (' + mb(g.size) + ')');
      else if (i === 0 && size + g.size <= CAPS.message) { first.push(part); size += g.size; }
      else later.push(part);
    });
    const value = n > 1 ? n + ' strips, left to right' + (notes.length ? '; ' + notes.join(', ') : '')
      : notes.length ? notes[0] : later.length ? 'next message' : null;
    if (value) fields.push(field('Game frame', value));
  }
  first.push({ name: 'details.json', blob: detailsFile });
  const embed = {
    title,
    description: text ? text.split('\n').map(l => '> ' + l).join('\n') : '*(no words, see the pictures)*',
    color: COLOR[kind],
    fields,
    footer: { text: who ? (who.discordId ? 'Discord id ' + who.discordId : 'Signed in') : 'Not signed in' },
  };
  if (page) embed.image = { url: 'attachment://page.jpg' };
  const attachments = list => list.map((f, i) => ({ id: i, filename: f.name }));
  const out = [{ payload: { username: NAME, allowed_mentions: NO_PINGS, embeds: [embed], attachments: attachments(first) }, files: first }];
  for (const p of later) out.push({ payload: { username: NAME, allowed_mentions: NO_PINGS, content: p.content, attachments: attachments([p]) }, files: [p] });
  return out;
}

async function postTo(url, msg, fetchFn) {
  const fd = new FormData();
  fd.append('payload_json', JSON.stringify(msg.payload));
  msg.files.forEach((f, i) => fd.append('files[' + i + ']', f.blob, f.name));
  // Discord's answer goes to the Cloudflare logs when it says no (its error bodies never hold the token; the URL is never logged)
  try {
    const r = await fetchFn(url + (url.includes('?') ? '&' : '?') + 'wait=true', { method: 'POST', body: fd });
    if (!r.ok) console.error('discord said', r.status, (await r.text().catch(() => '')).slice(0, 300));
    return r.ok;
  } catch (e) { console.error('discord unreachable', (e && e.name) || 'error'); return false; }
}

const isFile = v => v != null && typeof v === 'object' && typeof v.size === 'number';

export async function handleReport(request, env, deps = {}) {
  const fetchFn = deps.fetch || ((...a) => fetch(...a)), now = deps.now || Date.now, limits = deps.limits || LIMITS;
  const origin = request.headers.get('Origin');
  if (!allowed(origin)) return answer(403, { error: SAY.origin }, null);
  const say = (status, error) => answer(status, { error }, origin);
  if (!env || !env.DISCORD_WEBHOOK_URL) return say(500, SAY.notSetUp);

  let form;
  try { form = await request.formData(); } catch (e) { return say(400, SAY.notReport); }
  const kind = form.get('kind'), rawText = form.get('text'), rawDetails = form.get('details'), token = form.get('token');
  const files = {};
  for (const [k, type] of [['page', 'image/jpeg'], ['popout', 'image/png']].concat(STRIPS.map(s => [s, 'image/png']))) {
    const f = form.get(k);
    if (f == null || f === '') continue;
    if (!isFile(f) || f.type !== type) return say(400, SAY.notReport);
    if (!STRIPS.includes(k) && f.size > CAPS[k]) return say(413, SAY.tooBig);   // a too big game strip is left out with a note instead
    files[k] = f;
  }
  if (kind !== 'wrong' && kind !== 'idea') return say(400, SAY.notReport);
  if (typeof rawText !== 'string' && rawText != null) return say(400, SAY.notReport);
  // a form sends line breaks as \r\n, while the box counted each as one character
  const text = (rawText || '').replace(/\r\n?/g, '\n');
  if (text.length > CAPS.text) return say(400, SAY.tooLong);
  if (typeof rawDetails !== 'string') return say(400, SAY.notReport);
  if (new TextEncoder().encode(rawDetails).length > CAPS.details) return say(413, SAY.tooBig);
  let details;
  try { details = JSON.parse(rawDetails); } catch (e) { return say(400, SAY.notReport); }
  if (!details || typeof details !== 'object' || Array.isArray(details)) return say(400, SAY.notReport);
  const words = text.trim();
  if (!words && !Object.keys(files).length) return say(400, SAY.notReport);

  // five an hour from one place; only reports that got this far count
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown', t = now();
  const recent = (limits.get(ip) || []).filter(x => t - x < HOUR);
  if (recent.length >= CAPS.perHour) { limits.set(ip, recent); return say(429, SAY.slow); }
  limits.set(ip, recent.concat(t));
  if (limits.size > 2000) for (const [k, v] of limits) if (!v.some(x => t - x < HOUR)) limits.delete(k);

  const who = await whoIs(typeof token === 'string' ? token : '', fetchFn);
  const messages = buildMessages({ kind, text: words, details, who, files, commit: env.CF_PAGES_COMMIT_SHA });
  const hook = String(env.DISCORD_WEBHOOK_URL).trim();   // a secret pasted with a stray space still works
  if (!(await postTo(hook, messages[0], fetchFn))) {
    // nothing was sent, so this try doesn't count against the hour
    const mine = limits.get(ip) || [], i = mine.lastIndexOf(t);
    if (i >= 0) limits.set(ip, mine.slice(0, i).concat(mine.slice(i + 1)));
    return say(502, SAY.discord);
  }
  // the report is in; a game frame that fails on its own doesn't make the player send it all again
  for (const m of messages.slice(1)) await postTo(hook, m, fetchFn);
  return answer(200, { ok: true }, origin);
}

export const onRequestPost = ({ request, env }) => handleReport(request, env);
export function onRequestOptions({ request }) {
  const origin = request.headers.get('Origin');
  if (!allowed(origin)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: Object.assign(cors(origin), {
    'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'Content-Type', 'access-control-max-age': '86400' }) });
}
