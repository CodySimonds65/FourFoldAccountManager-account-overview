// Account overview: every account at a glance, with totals, and a marker for an open account that has stopped
// earning. The working-out is in overview.mjs. Where FourFold has the live game feed, silver, idle and place come
// from its events; otherwise, and for class, XP and balances, from FourFold's reads.
import {
  applyLiveFight, applyLiveResult, applyRead, createSession, describe, endLive, forget, loadRemembered, prefix,
  remember, startLive, toRead, totalsOf
} from './overview.mjs';

const totalsBox = document.getElementById('totals');
const list = document.getElementById('accounts');
const sessions = new Map(); // account id -> session; open accounts only
let remembered = {};
let unsaved = false; // whether `remembered` has changes that haven't reached storage yet
// The live game feed (plugin API 3): missing on an older FourFold, and only used while its status is active.
const hasFeed = typeof fourfold.battle?.onResult === 'function';
let feedActive = false;
let accounts = []; // the account list from the latest refresh, which the once-a-second redraw works from

const known = value => typeof value === 'number' && Number.isFinite(value);
const exact = value => Math.round(value).toLocaleString('en-US');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
// The panel is narrow, so a big number is shown compact. Its exact value is on hover.
const short = value => (Math.abs(value) >= 100000 ? compact.format(value) : exact(value));
// A card refuses text over 40 characters, and text with control or invisible formatting characters.
const fit = text => {
  const plain = text.replace(/[\p{Cc}\p{Cf}]/gu, '');
  return plain.length > 40 ? `${prefix(plain, 39)}…` : plain;
};

function ago(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h ${minutes % 60}m` : `${Math.floor(hours / 24)}d`;
}

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
function element(tag, className, text) {
  const created = document.createElement(tag);
  if (className) created.className = className;
  if (text !== undefined) created.textContent = text;
  return created;
}

// A number, compact when it is big, with the exact value on hover. A dash when it isn't known.
function number(value, unit) {
  const span = element('span', 'number', known(value) ? `${short(value)} ${unit}` : `— ${unit}`);
  if (known(value)) span.title = `${exact(value)} ${unit}`;
  return span;
}

// A line of parts with dots between them.
function line(...parts) {
  const row = element('p');
  parts.forEach((part, index) => {
    if (index > 0) row.append(' · ');
    row.append(part);
  });
  return row;
}

// What sits to the right of the label: where the account is, or why its numbers aren't live.
function marker(view, now) {
  if (view.state === 'live' && view.idle) return element('span', 'marker idle', `Idle ${ago(view.idleMs)}`);
  if (view.state === 'live') {
    // A long place name is cut to fit, with the whole of it on hover.
    const place = element('span', 'marker', view.location ?? '');
    place.title = view.location ?? '';
    return place;
  }
  if (view.state === 'stale') return element('span', 'marker', 'Stale');
  if (view.state === 'waiting') return element('span', 'marker', 'Waiting');
  if (view.state === 'closed') return element('span', 'marker', `${ago(now - view.at)} ago`);
  return element('span', 'marker', 'Closed');
}

function block(view, now) {
  const root = element('div', `account ${view.state}`);
  const head = element('div', 'head');
  const label = element('span', 'label', view.label);
  label.title = view.label;
  head.append(label, marker(view, now));
  root.append(head);
  if (!known(view.at)) {
    root.append(element('p', 'muted', 'No data yet'));
    return root;
  }

  const who = `${view.className ?? 'No class yet'}${known(view.level) ? ` ${view.level}` : ''}`;
  // A stale account keeps its last known rates, dimmed.
  const rated = view.state === 'live' || view.state === 'stale';
  root.append(rated ? line(who, number(view.xpPerHour, 'XP/hr')) : line(who));
  const balances = [number(view.silver, 'silver'), number(view.gold, 'gold')];
  if (rated) {
    balances.push(known(view.silverPerHour) ? number(view.silverPerHour, 'silver/hr') : element('span', '', 'No rate yet'));
  }
  root.append(line(...balances));
  return root;
}

function draw(views, totals, now) {
  const isOpen = view => view.state === 'live' || view.state === 'stale' || view.state === 'waiting';
  const summary = [
    element('p', 'big', totals.idle > 0 ? `${totals.open} open, ${totals.idle} idle` : `${totals.open} open`),
    line(number(totals.xpPerHour, 'XP/hr'), number(totals.silverPerHour, 'silver/hr')),
    line(number(totals.silver, 'silver'), number(totals.gold, 'gold'))
  ];
  if (totals.lastSeenCounted > 0) {
    const accounts = totals.lastSeenCounted === 1 ? '1 account' : `${totals.lastSeenCounted} accounts`;
    summary.push(element('p', 'muted', `Includes ${accounts} as last seen.`));
  }
  totalsBox.replaceChildren(...summary);

  // Open accounts first, in FourFold's order, then the rest.
  const ordered = [...views.filter(isOpen), ...views.filter(view => !isOpen(view))];
  if (ordered.length === 0) list.replaceChildren(element('p', 'muted', 'No accounts yet. Add one in FourFold.'));
  else list.replaceChildren(...ordered.map(view => block(view, now)));
}

async function setCard(totals) {
  const rows = [
    { label: 'Open', value: totals.idle > 0 ? `${totals.open}, ${totals.idle} idle` : String(totals.open) },
    { label: 'XP/hr', value: short(totals.xpPerHour) },
    { label: 'Silver/hr', value: short(totals.silverPerHour) },
    { label: 'Silver', value: short(totals.silver) },
    { label: 'Gold', value: short(totals.gold) }
  ];
  if (totals.idle > 0) rows.push({ label: 'Idle', value: fit(totals.idleLabels.join(', ')) });
  await fourfold.cards.set('overview', null, { summary: `${totals.open} open, ${totals.idle} idle`, rows });
}

async function refresh() {
  accounts = await fourfold.accounts.list();
  if (forget(remembered, new Set(accounts.map(account => account.id)))) unsaved = true;
  // A closed account's session is over. Its last values are saved now, so "how long ago" survives a restart.
  for (const id of [...sessions.keys()]) {
    if (!accounts.some(account => account.id === id && account.isOpen)) {
      sessions.delete(id);
      unsaved = true;
    }
  }

  for (const account of accounts.filter(candidate => candidate.isOpen)) {
    let session = sessions.get(account.id);
    if (!session) sessions.set(account.id, (session = createSession()));
    // Live only while the feed is watching this account: location.get has a place for it. One already in game when
    // the feed was switched on has none until its game reconnects, and stays on reads.
    const place = feedActive ? await fourfold.location.get(account.id).catch(() => null) : null;
    if (place) startLive(session, Date.now(), place.scene, place.inBattle);
    else endLive(session, Date.now());
    const xp = await fourfold.xp.get(account.id);
    const profile = await fourfold.profile.get(account.id);
    // FourFold has started this account's tracking over (its profile was edited, say). The reads before and after
    // may not even be of the same player, so the session starts over too.
    // The feed still watches the account, so the new session is live from now.
    if (xp.updatedAt === null && session.last) {
      sessions.set(account.id, (session = createSession()));
      if (place) startLive(session, Date.now(), place.scene, place.inBattle);
    }
    // Both answers come from one read. If a new read landed between the two calls, wait for the next refresh.
    if (xp.updatedAt !== profile.updatedAt) continue;
    const read = toRead(xp, profile);
    applyRead(session, read);
    if (read && remember(remembered, account.id, read)) unsaved = true;
  }

  const now = Date.now();
  const views = accounts.map(account => describe(account, sessions.get(account.id), remembered, now));
  const totals = totalsOf(views);
  draw(views, totals, now);
  syncTimer();
  // A refused card or a failed save must not stop the panel from updating.
  await setCard(totals).catch(error => console.warn(error.code ?? error.message));
  // A refused save is tried again at the next refresh.
  if (unsaved) {
    unsaved = false;
    await fourfold.storage.set('remembered', remembered).catch(error => {
      unsaved = true;
      console.warn(error.code ?? error.message);
    });
  }
}

// Events arrive in bursts (xp.onUpdated fires once per account). Refreshes run one after another, and a burst asks
// for one more refresh, not one each.
let queue = Promise.resolve();
let waiting = false;
function render() {
  if (waiting) return queue;
  waiting = true;
  queue = queue.then(() => {
    waiting = false;
    return refresh();
  }).catch(error => console.warn(error.code ?? error.message));
  return queue;
}

// While an account is live, its rates are worked out at the time of asking and fall every second between fights, so
// the panel redraws once a second. Only the panel: the card and the saved values keep the refresh's schedule, and a
// read is never applied here, so no gain, idle time or interval changes. A tick waits its turn behind a refresh, and
// at most one waits.
let timer = null;
let ticking = false;
let pressed = false; // a mouse button is held: a redraw would rebuild a block under it
document.addEventListener('pointerdown', () => { pressed = true; }, true);
for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, () => { pressed = false; }, true);

function syncTimer() {
  const live = [...sessions.values()].some(session => session.live);
  if (live && timer === null) timer = setInterval(tick, 1000);
  else if (!live && timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

function tick() {
  if (ticking) return;
  ticking = true;
  queue = queue.then(async () => {
    ticking = false;
    if (pressed) return;
    for (const account of accounts) {
      const session = sessions.get(account.id);
      if (!account.isOpen || !session?.live || !session.last) continue;
      // A rejected read leaves this account as it was for this tick.
      const xp = await fourfold.xp.get(account.id).catch(() => null);
      // The rate, and the class and XP beside it, are live in xp.get. A different read time means a new poll landed,
      // which only the next refresh may apply.
      if (!xp || xp.isStale || Date.parse(xp.updatedAt) !== session.last.at) continue;
      const { xpPerHour, level, className, currentXp, nextLevelXp } = xp;
      Object.assign(session.last, { xpPerHour, level, className, currentXp, nextLevelXp });
    }
    const now = Date.now();
    const views = accounts.map(account => describe(account, sessions.get(account.id), remembered, now));
    draw(views, totalsOf(views), now);
  }).catch(error => console.warn(error.code ?? error.message));
}

async function start() {
  remembered = loadRemembered(await fourfold.storage.get('remembered'));
  fourfold.accounts.onChanged(render);
  fourfold.xp.onUpdated(render);
  // The idle markers count up between reads too.
  setInterval(render, 60000);
  if (hasFeed) {
    feedActive = (await fourfold.live.getStatus().catch(() => null))?.state === 'active';
    fourfold.live.onStatusChanged(status => {
      feedActive = status.state === 'active';
      render();
    });
    const live = accountId => sessions.get(accountId)?.live ? sessions.get(accountId) : null;
    // The account is live from its first place, not from the next refresh, so a fight that ends before that refresh
    // (one resumed right after F5, say) still counts. An account without a session yet is left to the refresh.
    fourfold.location.onChanged(({ accountId, scene, inBattle }) => {
      const session = sessions.get(accountId);
      if (feedActive && scene !== null && session) startLive(session, Date.now(), scene, inBattle);
      render();
    });
    fourfold.session.onDisconnected(({ accountId }) => {
      const session = sessions.get(accountId);
      if (session) endLive(session, Date.now());
      render();
    });
    const fight = ({ accountId, at }) => {
      const session = live(accountId);
      if (!session) return;
      applyLiveFight(session, Date.parse(at));
      render();
    };
    fourfold.battle.onStarted(fight);
    fourfold.battle.onEnded(fight);
    fourfold.battle.onResult(({ accountId, silverGained, at }) => {
      const session = live(accountId);
      if (!session) return;
      applyLiveResult(session, silverGained, Date.parse(at));
      render();
    });
  }
  await render();
}

start().catch(error => { list.textContent = `Account overview failed: ${error.message}`; });
