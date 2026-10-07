// Checks overview.mjs outside FourFold. Run: node .check/overview.check.mjs
import assert from 'node:assert/strict';
import {
  LIVE_RATE_MIN_MS, applyLiveFight, applyLiveResult, applyRead, createSession, describe, endLive, forget,
  loadRemembered, prefix, remember, silverPerHour, startLive, toRead, totalsOf
} from '../overview.mjs';

const MIN = 60000;
const start = Date.UTC(2026, 9, 5, 12, 0);
const at = minute => start + minute * MIN;
// A read at `minute` with the active class's XP, the client's XP rate and the balances as given.
const read = (minute, { xp = 0, level = 10, silver = 0, gold = 0, rate = null, className = 'Warrior', location = 'Battle' } = {}) =>
  ({ at: at(minute), className, level, currentXp: xp, nextLevelXp: 1000, xpPerHour: rate, silver, gold, location });
const feed = (...reads) => {
  const session = createSession();
  for (const next of reads) applyRead(session, next);
  return session;
};
const open = { id: 'a', label: 'Main', isOpen: true };
const closed = { id: 'a', label: 'Main', isOpen: false };

// An account that hasn't earned anything this session is parked, not idle: a bank account must not show as a problem.
{
  const parked = feed(...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(minute => read(minute, { silver: 500 })));
  const view = describe(open, parked, {}, at(10));
  assert.equal(view.state, 'live');
  assert.equal(view.idle, false);
  assert.equal(view.idleMs, null);
}

// A deposit doesn't make a bank account a fighter: only a gain made in an arena, a dungeon or a battle arms the marker.
{
  const bank = feed(
    read(0, { silver: 720000, location: 'Town' }),
    read(1, { silver: 720000, location: 'Town' }),
    read(2, { silver: 1620000, gold: 5, location: 'Town' }),
    ...[3, 4, 5, 6, 7, 8, 9, 10].map(minute => read(minute, { silver: 1620000, gold: 5, location: 'Town' })));
  const view = describe(open, bank, {}, at(10));
  assert.equal(view.idle, false);
  assert.equal(view.idleMs, null);

  // The last battle's reward can arrive in the minute that ends back in town. It still counts as fighting.
  const fighter = feed(
    read(0, { location: ' battle ' }),
    read(1, { xp: 40, silver: 90, location: 'Town' }),
    ...[2, 3, 4, 5, 6].map(minute => read(minute, { xp: 40, silver: 90, location: 'Town' })));
  assert.equal(describe(open, fighter, {}, at(6)).idle, true);
}

// The idle marker: it appears five minutes after the last gain, counts up, and clears on the next one.
{
  const session = feed(read(0), read(1, { xp: 10 }), ...[2, 3, 4, 5, 6].map(minute => read(minute, { xp: 10 })));
  assert.equal(describe(open, session, {}, at(6) - 1000).idle, false);
  const idle = describe(open, session, {}, at(6));
  assert.equal(idle.state, 'live');
  assert.equal(idle.idle, true);
  assert.equal(idle.idleMs, 5 * MIN);
  assert.equal(describe(open, session, {}, at(9)).idleMs, 8 * MIN);

  applyRead(session, read(10, { xp: 10, gold: 1 }));
  const earning = describe(open, session, {}, at(10));
  assert.equal(earning.idle, false);
  assert.equal(earning.idleMs, 0);
}

// A stale account is Stale, not idle: unread and idle can't be told apart. It keeps its last values.
{
  const session = feed(read(0, { silver: 700, rate: 4000 }), read(1, { silver: 760, rate: 4000 }));
  applyRead(session, null);
  const stale = describe(open, session, {}, at(30));
  assert.equal(stale.state, 'stale');
  assert.equal(stale.idle, false);
  assert.equal(stale.silver, 760);
  // One failed read doesn't take the account's rates out of the totals: the last known ones stand.
  assert.equal(stale.xpPerHour, 4000);
  assert.equal(stale.silverPerHour, 3600);
  assert.equal(totalsOf([stale]).xpPerHour, 4000);
  assert.equal(totalsOf([stale]).silverPerHour, 3600);

  applyRead(session, read(31, { silver: 700 }));
  assert.equal(describe(open, session, {}, at(31)).state, 'live');
}

// Open with nothing read yet, closed with remembered values, and closed with none.
{
  assert.equal(describe(open, createSession(), {}, at(0)).state, 'waiting');
  const remembered = { a: { className: 'Mage', level: 7, silver: 50, gold: 5, at: at(-120) } };
  // An account that has just been opened shows its remembered values until its first read, and they are counted as
  // "last seen" like a closed account's.
  const justOpened = describe(open, createSession(), remembered, at(0));
  assert.equal(justOpened.state, 'waiting');
  assert.equal(justOpened.silver, 50);
  assert.equal(totalsOf([justOpened]).lastSeenCounted, 1);
  assert.deepEqual(describe(closed, undefined, remembered, at(0)), {
    id: 'a', label: 'Main', state: 'closed', className: 'Mage', level: 7, xpPerHour: null, silver: 50, gold: 5,
    silverPerHour: null, location: null, idle: false, idleMs: null, at: at(-120)
  });
  assert.equal(describe(closed, undefined, {}, at(0)).state, 'none');
}

// Silver per hour: earned only, over the hour ending at the latest read.
{
  assert.equal(silverPerHour(feed(read(0, { silver: 1000 }))), null);
  const session = feed(read(0, { silver: 1000 }), read(1, { silver: 1100 }), read(2, { silver: 1100 }));
  assert.equal(silverPerHour(session), 3000);
  applyRead(session, read(3, { silver: 500 }));
  assert.equal(silverPerHour(session), 2000);
  // An hour on, the old gains have dropped out of the window. The long gap itself is never measured.
  applyRead(session, read(64, { silver: 500 }));
  applyRead(session, read(65, { silver: 500 }));
  assert.equal(silverPerHour(session), 0);
}

// A gap with nothing gained across it leaves the idle clock running. Only a gain restarts it.
{
  const session = feed(read(0), read(1, { xp: 10 }), read(2, { xp: 10 }), read(20, { xp: 10 }));
  assert.equal(describe(open, session, {}, at(20)).idleMs, 19 * MIN);
}

// A gap of more than three minutes is unknown: no interval is measured across it. A gain across it restarts idle.
{
  const session = feed(read(0, { silver: 0 }), read(1, { silver: 10, xp: 5 }), read(10, { silver: 9000 }));
  assert.equal(silverPerHour(session), 600);
  assert.equal(describe(open, session, {}, at(10)).idleMs, 0);
}

// Totals: rates over live accounts, balances over every account with a known value, and how many of those are closed.
{
  const idleSession = feed(read(-1, { silver: 90, gold: 1, rate: 1000 }), ...[0, 1, 2, 3, 4, 5].map(minute => read(minute, { silver: 100, gold: 1, rate: 1000 })));
  const busySession = feed(read(4, { silver: 100, gold: 2, rate: 2000 }), read(5, { silver: 200, gold: 2, rate: 2000 }));
  const remembered = { c: { className: 'Mage', level: 7, silver: 50, gold: 5, at: at(-60) } };
  const views = [
    describe({ id: 'a', label: 'A', isOpen: true }, idleSession, remembered, at(5)),
    describe({ id: 'b', label: 'B', isOpen: true }, busySession, remembered, at(5)),
    describe({ id: 'c', label: 'C', isOpen: false }, undefined, remembered, at(5)),
    describe({ id: 'd', label: 'D', isOpen: false }, undefined, remembered, at(5))
  ];
  assert.deepEqual(totalsOf(views), {
    open: 2, idle: 1, idleLabels: ['A'], xpPerHour: 3000, silverPerHour: 6100, silver: 350, gold: 8, lastSeenCounted: 1
  });
}

// What is remembered for a closed account, and when the store needs saving.
{
  const remembered = {};
  assert.equal(remember(remembered, 'a', read(0, { silver: 5, gold: 1 })), true);
  assert.deepEqual(remembered, { a: { className: 'Warrior', level: 10, silver: 5, gold: 1, at: at(0), savedAt: at(0) } });
  // Unchanged values aren't worth a write every minute, but a write every ten. The time on show is always the
  // latest read's, so "how long ago" is right the moment the account closes.
  assert.equal(remember(remembered, 'a', read(1, { silver: 5, gold: 1 })), false);
  assert.equal(remembered.a.at, at(1));
  assert.equal(remember(remembered, 'a', read(10, { silver: 5, gold: 1 })), true);
  assert.equal(remembered.a.savedAt, at(10));
  assert.equal(remember(remembered, 'a', read(11, { silver: 6, gold: 1 })), true);
  assert.equal(forget(remembered, new Set(['a'])), false);
  assert.equal(forget(remembered, new Set(['b'])), true);
  assert.deepEqual(remembered, {});
  assert.deepEqual(loadRemembered('junk'), {});
  assert.deepEqual(loadRemembered({ a: { silver: 1 } }), { a: { silver: 1 } });
}

// What counts as a read at all. An account with no class yet still has balances worth showing.
{
  const xp = { className: null, level: null, currentXp: null, nextLevelXp: null, xpPerHour: null, updatedAt: '2026-10-05T12:00:00Z', isStale: false };
  const profile = { silver: 7, gold: 1, location: 'Town' };
  assert.deepEqual(toRead(xp, profile), {
    at: start, className: null, level: null, currentXp: null, nextLevelXp: null, xpPerHour: null, silver: 7, gold: 1, location: 'Town'
  });
  assert.equal(toRead({ ...xp, isStale: true }, profile), null);
  assert.equal(toRead({ ...xp, updatedAt: null }, profile), null);
}

// Live: idle counts from the last fight, and an account that never fights while watched is still parked, not idle.
{
  const session = feed(read(0, { location: 'Town' }));
  startLive(session, at(0), 'town_square');
  applyRead(session, read(1, { location: 'Town' }));
  assert.equal(describe(open, session, {}, at(30)).idle, false);
  applyLiveFight(session, at(31));
  applyLiveResult(session, 50, at(32));
  assert.equal(describe(open, session, {}, at(37) - 1000).idle, false);
  const idle = describe(open, session, {}, at(37));
  assert.equal(idle.idle, true);
  assert.equal(idle.idleMs, 5 * MIN);
  // The place is the game's own area, not the profile page's word for it.
  startLive(session, at(38), 'westhills_b2_dungeon_01');
  assert.equal(describe(open, session, {}, at(38)).location, 'Westhills B2 · Dungeon 1');
}

// Live silver counts each fight once. A read while live adds nothing, even though its balance holds the same silver,
// and the first two reads after a live stretch only start a new baseline.
{
  const session = feed(read(0, { silver: 1000 }));
  startLive(session, at(0), 'arena_01');
  applyLiveResult(session, 300, at(1));
  applyRead(session, read(1.5, { silver: 1300 }));
  applyLiveResult(session, 300, at(2));
  applyLiveResult(session, 300, at(1)); // a late fight
  // 600 over 2 watched minutes is 18,000 an hour; 4 idle minutes later it is 6,000.
  assert.equal(Math.round(silverPerHour(session, at(2))), 18000);
  assert.equal(Math.round(silverPerHour(session, at(6))), 6000);
  endLive(session, at(2));
  applyRead(session, read(3, { silver: 1600 }));
  applyRead(session, read(4, { silver: 1600 }));
  assert.equal(session.intervals.length, 2);
  applyRead(session, read(5, { silver: 1700 }));
  assert.equal(session.intervals.length, 3);
  // Back on reads, idle counts from the last gain they show again.
  assert.equal(describe(open, session, {}, at(8)).idleMs, 3 * MIN);
}

// The profile can lag the last fight by a read, so the second read after a live stretch may be the first to show the
// fight's silver. It is a baseline too: the silver was counted from the fight.
{
  const session = feed(read(0, { silver: 1000 }));
  startLive(session, at(0.5), 'arena_01');
  applyLiveResult(session, 500, at(1));
  endLive(session, at(1.1));
  applyRead(session, read(1.2, { silver: 1000 })); // lags the fight
  applyRead(session, read(2.2, { silver: 1500 })); // the fight's silver at last
  applyRead(session, read(3.2, { silver: 1600 }));
  assert.deepEqual(session.intervals.map(interval => interval.silver), [500, 0, 100]);
}

// Leaving live keeps the idle time watched since the last fight, so the polled rate doesn't jump: 3,000 silver over
// 30 minutes of fights and 30 idle is about 3,000 an hour either side of the switch.
{
  const session = feed(read(0));
  startLive(session, at(0), 'arena_01');
  for (let minute = 1; minute <= 30; minute++) applyLiveResult(session, 100, at(minute));
  assert.equal(Math.round(silverPerHour(session, at(60))), 3000);
  endLive(session, at(60));
  applyRead(session, read(60.5, { silver: 3000 }));
  assert.ok(Math.abs(silverPerHour(session) - 3000) < 100);
}

// Two results with the same time are one batch of game data: both count, in the same interval.
{
  const session = feed(read(0));
  startLive(session, at(0), 'arena_01');
  applyLiveResult(session, 300, at(2));
  applyLiveResult(session, 200, at(2));
  assert.deepEqual(session.intervals.map(interval => interval.silver), [500]);
}

// A failed read while the feed watches the account: idle, place and silver per hour still come from the feed.
{
  const session = feed(read(0, { rate: 4000 }));
  startLive(session, at(0), 'westhills_b2_dungeon_01');
  applyLiveResult(session, 700, at(1));
  applyRead(session, null);
  const view = describe(open, session, {}, at(7));
  assert.equal(view.state, 'live');
  assert.equal(view.idleMs, 6 * MIN);
  assert.equal(view.location, 'Westhills B2 · Dungeon 1');
  assert.equal(view.xpPerHour, 4000);
  assert.equal(view.silverPerHour, 6000);
}

// No live rate until a minute has been watched: the first fight can't read as millions an hour.
{
  const session = feed(read(0));
  startLive(session, at(0), 'arena_01');
  applyLiveResult(session, 500, at(0.25));
  assert.equal(silverPerHour(session, at(0) + LIVE_RATE_MIN_MS - 1), null);
  assert.notEqual(silverPerHour(session, at(0) + LIVE_RATE_MIN_MS), null);
}

// A repeated read takes the XP fields FourFold updates after each live fight, and nothing else: no gain, no idle
// change, no interval.
{
  const session = feed(read(0, { xp: 10, silver: 100, rate: 1000 }));
  applyRead(session, read(0, { xp: 60, level: 11, silver: 999, rate: 5000 }));
  assert.equal(session.last.currentXp, 60);
  assert.equal(session.last.level, 11);
  assert.equal(session.last.xpPerHour, 5000);
  assert.equal(session.last.silver, 100);
  assert.equal(session.intervals.length, 0);
  assert.equal(session.lastGainAt, at(0));
}

// A cut never lands in the middle of an emoji.
assert.equal(prefix('ab😀cd', 3), 'ab');

console.log('overview.mjs: all checks passed');
