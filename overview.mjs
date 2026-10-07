// What the Account overview works out from FourFold's reads: idle time, silver per hour, what to show for each
// account, and the totals. Nothing here touches the page or window.fourfold, so .check/overview.check.mjs can run it
// with Node.

const HOUR_MS = 3600000;
// Reads are a minute apart. A longer gap means reads were missed, and what happened in it is unknown.
const MAX_INTERVAL_MS = 3 * 60000;
// An open account that was fighting and then has no gain for this long is shown as idle.
export const IDLE_MS = 5 * 60000;
// A closed account's "last seen" time is saved again this often even when its values haven't changed.
const REFRESH_MS = 10 * 60000;
// A live silver rate needs this much watched time first, so the first fight doesn't read as millions an hour.
export const LIVE_RATE_MIN_MS = 60000;

// The profile page never names the arena: it says Arena in every hub, Dungeon inside one, and Battle in a fight.
const FIGHTING = ['arena', 'dungeon', 'battle'];
const isFighting = location => typeof location === 'string' && FIGHTING.includes(location.trim().toLowerCase());

// One answer pair from fourfold.xp.get and fourfold.profile.get. Null when it isn't a read: the account is closed
// or stale. An account with no class yet is still a read, because its balances are worth showing.
export function toRead(xp, profile) {
  const at = typeof xp.updatedAt === 'string' ? Date.parse(xp.updatedAt) : NaN;
  if (xp.isStale || Number.isNaN(at)) return null;
  return {
    at,
    className: xp.className,
    level: xp.level,
    currentXp: xp.currentXp,
    nextLevelXp: xp.nextLevelXp,
    xpPerHour: xp.xpPerHour,
    silver: profile.silver,
    gold: profile.gold,
    location: profile.location
  };
}

// Earned only: a drop is spending, and a missing value is no gain.
const increase = (before, after) => (Number.isFinite(before) && Number.isFinite(after) ? Math.max(0, after - before) : 0);

// Whether the active class moved forward between two reads.
function xpGained(before, after) {
  if (before.className !== after.className || !Number.isFinite(before.level) || !Number.isFinite(after.level)) return false;
  return after.level > before.level || (after.level === before.level && increase(before.currentXp, after.currentXp) > 0);
}

// One open account, as seen since it was opened. Kept in memory only. `earned` is whether it has gained anything
// while fighting yet: an account that never has, a bank account say, is parked, not idle, and a deposit into it
// doesn't change that. `live` is null while everything comes from reads, and { lastMark, lastFightAt, scene } while
// the live game feed is watching the account: then silver, idle and place come from its events.
export function createSession() {
  return { last: null, lastGainAt: null, earned: false, intervals: [], stale: false, live: null, rebase: false };
}

// Takes the latest answer for an open account: a read, or null when FourFold has none to give.
export function applyRead(session, read) {
  if (!read) {
    session.stale = true;
    return;
  }
  session.stale = false;
  const previous = session.last;
  // The same read again: xp.onUpdated also fires for changes that aren't a new read.
  if (previous && read.at <= previous.at) return;
  session.last = read;

  const silver = previous ? increase(previous.silver, read.silver) : 0;
  const gained = previous !== null && (silver > 0 || increase(previous.gold, read.gold) > 0 || xpGained(previous, read));
  // By either end of the interval: the last battle's reward can arrive in the minute that ends back in town.
  if (gained && (isFighting(previous.location) || isFighting(read.location))) session.earned = true;
  // A gain restarts the idle clock, and so does one that arrived somewhere in a gap. A gap with nothing gained
  // doesn't.
  if (!previous || gained) session.lastGainAt = read.at;
  // What happened across a gap is unknown, so no rate is measured over it. While live, the fights count the silver,
  // and the first read after a live stretch only starts a new baseline: its silver was counted from the fights too.
  if (session.live || session.rebase) {
    if (!session.live) session.rebase = false;
  } else if (previous && read.at - previous.at <= MAX_INTERVAL_MS) {
    session.intervals.push({ from: previous.at, to: read.at, silver });
  }
  session.intervals = session.intervals.filter(interval => interval.to > read.at - HOUR_MS);
}

// The live game feed is watching the account from `at` on, in `scene` (from fourfold.location.get).
export function startLive(session, at, scene) {
  if (!session.live) session.live = { lastMark: at, lastFightAt: null, scene: null };
  if (typeof scene === 'string') session.live.scene = scene;
}

// A fight started or ended. It restarts the idle clock, and an account that fights isn't parked.
export function applyLiveFight(session, at) {
  if (!session.live || !Number.isFinite(at)) return;
  session.live.lastFightAt = Math.max(session.live.lastFightAt ?? at, at);
  session.earned = true;
}

// A fight's reward from battle.onResult. Its silver counts from the last mark (the watch start or the previous
// fight's reward) to now, so the time between fights is in the rate too.
export function applyLiveResult(session, silver, at) {
  if (!session.live || !Number.isFinite(at) || at <= session.live.lastMark) return;
  applyLiveFight(session, at);
  const gain = Number.isFinite(silver) ? Math.max(0, silver) : 0;
  session.intervals.push({ from: session.live.lastMark, to: at, silver: gain });
  session.live.lastMark = at;
  session.intervals = session.intervals.filter(interval => interval.to > at - HOUR_MS);
}

// The feed stopped watching (a disconnect, or the feed switched off). The idle clock carries on from the last fight.
export function endLive(session) {
  if (!session.live) return;
  const lastFightAt = session.live.lastFightAt;
  if (lastFightAt !== null) session.lastGainAt = Math.max(session.lastGainAt ?? lastFightAt, lastFightAt);
  session.live = null;
  session.rebase = true;
}

// Silver earned per hour over the hour ending at the latest read, or null when nothing in it was measured. The same
// sum as Silver tracker: each interval counts for the part of it inside the hour. While live, it is the hour ending
// at `liveNow`, the time since the last fight counts as earning nothing, and it waits for a minute of watched time.
export function silverPerHour(session, liveNow) {
  if (session.live && Number.isFinite(liveNow)) {
    const open = liveNow > session.live.lastMark ? [{ from: session.live.lastMark, to: liveNow, silver: 0 }] : [];
    return rateOver([...session.intervals, ...open], liveNow, LIVE_RATE_MIN_MS);
  }
  if (!session.last) return null;
  return rateOver(session.intervals, session.last.at, 1);
}

function rateOver(intervals, now, minCovered) {
  let gain = 0;
  let covered = 0;
  for (const interval of intervals) {
    const overlap = Math.min(interval.to, now) - Math.max(interval.from, now - HOUR_MS);
    if (overlap <= 0) continue;
    gain += interval.silver * overlap / (interval.to - interval.from);
    covered += overlap;
  }
  return covered >= minCovered ? gain * HOUR_MS / covered : null;
}

// Everything one account's block shows. `session` is the open account's session, if it has one; `remembered` is
// what was saved for accounts read earlier. States: live (open and read), stale (open, but FourFold has no fresh
// read), waiting (open, nothing read yet), closed (showing remembered values) and none (closed, nothing known).
export function describe(account, session, remembered, now) {
  const view = {
    id: account.id, label: account.label, state: 'none', className: null, level: null, xpPerHour: null, silver: null,
    gold: null, silverPerHour: null, location: null, idle: false, idleMs: null, at: null
  };
  const read = account.isOpen ? session?.last : null;
  const known = read ?? remembered[account.id];
  if (known) {
    Object.assign(view, { className: known.className, level: known.level, silver: known.silver, gold: known.gold, at: known.at });
  }
  if (!account.isOpen) {
    view.state = known ? 'closed' : 'none';
  } else if (!read) {
    view.state = 'waiting';
  } else if (session.stale) {
    // Unread and idle can't be told apart, so there is no idle time. The last known rates and place still stand.
    Object.assign(view, {
      state: 'stale', xpPerHour: read.xpPerHour, silverPerHour: silverPerHour(session, now), location: read.location
    });
  } else {
    // While live, idle counts from the last fight; before the first one, from the last gain seen in reads.
    const since = session.live?.lastFightAt ?? session.lastGainAt;
    const idleMs = session.earned ? Math.max(0, now - since) : null;
    const location = session.live?.scene ? areaName(session.live.scene) : read.location;
    Object.assign(view, {
      state: 'live', xpPerHour: read.xpPerHour, silverPerHour: silverPerHour(session, now), location,
      idleMs, idle: idleMs !== null && idleMs >= IDLE_MS
    });
  }
  return view;
}

// The numbers at the top of the panel and on the card.
export function totalsOf(views) {
  const sum = (list, key) => list.reduce((total, view) => total + (Number.isFinite(view[key]) ? view[key] : 0), 0);
  const live = views.filter(view => view.state === 'live');
  // One failed read doesn't take an account's rates out of the totals.
  const rated = views.filter(view => view.state === 'live' || view.state === 'stale');
  const idle = live.filter(view => view.idle);
  // Values that come from an earlier session: a closed account's, and a just-opened one's until its first read.
  const lastSeen = view => (view.state === 'closed' || view.state === 'waiting') &&
    (Number.isFinite(view.silver) || Number.isFinite(view.gold));
  return {
    open: views.filter(view => view.state === 'live' || view.state === 'stale' || view.state === 'waiting').length,
    idle: idle.length,
    idleLabels: idle.map(view => view.label),
    xpPerHour: sum(rated, 'xpPerHour'),
    silverPerHour: sum(rated, 'silverPerHour'),
    silver: sum(views, 'silver'),
    gold: sum(views, 'gold'),
    lastSeenCounted: views.filter(lastSeen).length
  };
}

// Keeps what a closed account will show. The time is always the latest read's, so "how long ago" is right the
// moment an account closes. Returns whether the store now needs saving: when a value changed, or when the saved copy
// has fallen ten minutes behind.
export function remember(remembered, accountId, read) {
  const before = remembered[accountId];
  const same = before && before.className === read.className && before.level === read.level &&
    before.silver === read.silver && before.gold === read.gold;
  const save = !same || read.at - (before.savedAt ?? before.at) >= REFRESH_MS;
  remembered[accountId] = {
    className: read.className, level: read.level, silver: read.silver, gold: read.gold, at: read.at,
    savedAt: save ? read.at : before.savedAt ?? before.at
  };
  return save;
}

// A scene name as a place: `westhills_b2_dungeon_01` reads "Westhills B2 · Dungeon 1". The same as Farm report's.
export function areaName(scene) {
  const parts = String(scene ?? '').trim().split('_').filter(Boolean);
  if (parts.length === 0) return 'Unknown area';
  const word = part => (/^\d+$/.test(part) ? String(Number(part))
    : /^[a-z]\d+$/i.test(part) ? part.toUpperCase()
    : part[0].toUpperCase() + part.slice(1).toLowerCase());
  const inside = parts.findIndex((part, index) => index > 0 && part.toLowerCase() === 'dungeon');
  const name = inside > 0
    ? `${parts.slice(0, inside).map(word).join(' ')} · ${parts.slice(inside).map(word).join(' ')}`
    : parts.map(word).join(' ');
  return name.replace(/[\p{Cc}\p{Cf}]/gu, '');
}

// The start of a text, as whole characters, in at most `max` UTF-16 units (what FourFold counts a card's 40 in):
// a cut never splits an emoji in two.
export function prefix(text, max) {
  let kept = '';
  for (const character of text) {
    if (kept.length + character.length > max) break;
    kept += character;
  }
  return kept;
}

// Drops accounts that no longer exist. Returns whether anything was dropped.
export function forget(remembered, knownAccountIds) {
  const gone = Object.keys(remembered).filter(accountId => !knownAccountIds.has(accountId));
  for (const accountId of gone) delete remembered[accountId];
  return gone.length > 0;
}

// What was saved, kept only where it has the shape this plugin writes.
export function loadRemembered(saved) {
  return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
}
