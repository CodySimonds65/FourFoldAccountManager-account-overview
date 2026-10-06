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
// doesn't change that.
export function createSession() {
  return { last: null, lastGainAt: null, earned: false, intervals: [], stale: false };
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
  if (!previous || read.at - previous.at > MAX_INTERVAL_MS) {
    // Nothing trustworthy to measure from, so both the idle clock and the rate start fresh here.
    session.lastGainAt = read.at;
  } else {
    if (gained) session.lastGainAt = read.at;
    session.intervals.push({ from: previous.at, to: read.at, silver });
  }
  session.intervals = session.intervals.filter(interval => interval.to > read.at - HOUR_MS);
}

// Silver earned per hour over the hour ending at the latest read, or null when nothing in it was measured. The same
// sum as Silver tracker: each interval counts for the part of it inside the hour.
export function silverPerHour(session) {
  if (!session.last) return null;
  const now = session.last.at;
  let gain = 0;
  let covered = 0;
  for (const interval of session.intervals) {
    const overlap = Math.min(interval.to, now) - Math.max(interval.from, now - HOUR_MS);
    if (overlap <= 0) continue;
    gain += interval.silver * overlap / (interval.to - interval.from);
    covered += overlap;
  }
  return covered > 0 ? gain * HOUR_MS / covered : null;
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
    view.state = 'stale';
  } else {
    const idleMs = session.earned ? Math.max(0, now - session.lastGainAt) : null;
    Object.assign(view, {
      state: 'live', xpPerHour: read.xpPerHour, silverPerHour: silverPerHour(session), location: read.location,
      idleMs, idle: idleMs !== null && idleMs >= IDLE_MS
    });
  }
  return view;
}

// The numbers at the top of the panel and on the card.
export function totalsOf(views) {
  const sum = (list, key) => list.reduce((total, view) => total + (Number.isFinite(view[key]) ? view[key] : 0), 0);
  const live = views.filter(view => view.state === 'live');
  const idle = live.filter(view => view.idle);
  return {
    open: views.filter(view => view.state === 'live' || view.state === 'stale' || view.state === 'waiting').length,
    idle: idle.length,
    idleLabels: idle.map(view => view.label),
    xpPerHour: sum(live, 'xpPerHour'),
    silverPerHour: sum(live, 'silverPerHour'),
    silver: sum(views, 'silver'),
    gold: sum(views, 'gold'),
    closedCounted: views.filter(view => view.state === 'closed' && (Number.isFinite(view.silver) || Number.isFinite(view.gold))).length
  };
}

// Keeps what a closed account will show. Returns whether the store now needs saving: when a value changed, or when
// the saved time has fallen ten minutes behind.
export function remember(remembered, accountId, read) {
  const before = remembered[accountId];
  const same = before && before.className === read.className && before.level === read.level &&
    before.silver === read.silver && before.gold === read.gold;
  if (same && read.at - before.at < REFRESH_MS) return false;
  remembered[accountId] = { className: read.className, level: read.level, silver: read.silver, gold: read.gold, at: read.at };
  return true;
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
