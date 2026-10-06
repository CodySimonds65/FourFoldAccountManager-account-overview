// A stand-in for window.fourfold, so a plugin's panel can be looked at in an ordinary browser. It is not FourFold:
// it invents four accounts and plays their game forward one minute every two seconds. It lives in .check/, which the
// hub leaves out of the package. See preview.html.
(() => {
  const TICK_MS = 2000;
  const MINUTE = 60000;
  // The page's clock runs a minute per tick too, so idle times and "last seen" read as they would in real use.
  const began = Date.now();
  const realNow = Date.now.bind(Date);
  const clock = () => began + Math.floor((realNow() - began) / TICK_MS) * MINUTE;
  Date.now = clock;

  const theme = {
    background: '#101419', surface: '#171D24', surfaceRaised: '#1D252F', border: '#29333E', text: '#F2F0E9',
    textMuted: '#98A4B1', accent: '#E7C16B', danger: '#E57777'
  };
  const variable = name => `--ff-${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
  for (const [name, value] of Object.entries(theme)) document.documentElement.style.setProperty(variable(name), value);

  // Each account plays a short script, one step a minute: where it is and what it earns.
  const accounts = [
    { id: 'a1', label: 'Main', isOpen: true, className: 'Warrior', level: 34, xp: 4200, next: 90000, silver: 13025343, gold: 95050,
      rate: 41200, script: ['Arena', 'Dungeon', 'Battle', 'Battle', 'Battle'], earn: { xp: 700, silver: 1400, gold: 1 } },
    { id: 'a2', label: 'Alt with a rather long label', isOpen: true, className: 'Mage', level: 12, xp: 300, next: 6000, silver: 48210, gold: 310,
      rate: 9800, script: ['Battle', 'Battle', 'Town'], earn: { xp: 160, silver: 220, gold: 0 }, stopsAt: 4 },
    { id: 'a3', label: 'Banker', isOpen: true, className: null, level: null, xp: null, next: null, silver: 720000, gold: 12,
      rate: null, script: ['Town'], earn: { xp: 0, silver: 0, gold: 0 } },
    { id: 'a4', label: 'Closed one', isOpen: false }
  ];
  let minute = 0;
  const listeners = { accounts: new Set(), xp: new Set() };
  const store = new Map();
  const cards = new Map();

  function advance() {
    minute++;
    for (const account of accounts.filter(candidate => candidate.isOpen && candidate.className)) {
      const fighting = account.script[minute % account.script.length] === 'Battle';
      if (!fighting || (account.stopsAt && minute >= account.stopsAt)) continue;
      account.xp += account.earn.xp;
      account.silver += account.earn.silver;
      account.gold += account.earn.gold;
      if (account.xp >= account.next) {
        account.xp -= account.next;
        account.level++;
      }
    }
    for (const account of accounts.filter(candidate => candidate.isOpen)) {
      for (const callback of listeners.xp) callback({ accountId: account.id });
    }
    show();
  }

  const find = id => {
    const account = accounts.find(candidate => candidate.id === id);
    if (!account) throw Object.assign(new Error('That account id isn\'t known.'), { code: 'invalid-argument' });
    return account;
  };
  const updatedAt = () => new Date(clock()).toISOString();
  const answer = value => Promise.resolve(JSON.parse(JSON.stringify(value)));

  window.fourfold = Object.freeze({
    plugin: Object.freeze({ id: 'preview.plugin', version: '0.0.0', apiVersion: 2 }),
    theme: Object.freeze(theme),
    accounts: {
      list: () => answer(accounts.map(({ id, label, isOpen }) => ({ id, label, inGameName: null, isOpen }))),
      onChanged: callback => (listeners.accounts.add(callback), () => listeners.accounts.delete(callback))
    },
    xp: {
      get: async id => {
        const account = find(id);
        if (!account.isOpen) {
          return answer({ className: null, level: null, currentXp: null, nextLevelXp: null, xpUntilNextLevel: null,
            hoursUntilNextLevel: null, xpPerHour: null, sessionXp: 0, classes: [], updatedAt: null, isStale: true });
        }
        return answer({ className: account.className, level: account.level, currentXp: account.xp, nextLevelXp: account.next,
          xpUntilNextLevel: account.next === null ? null : account.next - account.xp, hoursUntilNextLevel: null,
          xpPerHour: account.rate, sessionXp: 0, classes: [], updatedAt: updatedAt(), isStale: false });
      },
      onUpdated: callback => (listeners.xp.add(callback), () => listeners.xp.delete(callback))
    },
    profile: {
      get: async id => {
        const account = find(id);
        if (!account.isOpen) return answer({ silver: null, gold: null, location: null, playerId: null, updatedAt: null, isStale: true });
        return answer({ silver: account.silver, gold: account.gold, location: account.script[minute % account.script.length],
          playerId: null, updatedAt: updatedAt(), isStale: false });
      }
    },
    storage: {
      get: key => answer(store.get(key) ?? null),
      set: (key, value) => (store.set(key, JSON.parse(JSON.stringify(value))), answer(null)),
      remove: key => (store.delete(key), answer(null))
    },
    cards: {
      set: (cardId, accountId, content) => (cards.set(`${cardId} ${accountId ?? '(global)'}`, content), show(), answer(null)),
      clear: (cardId, accountId) => (cards.delete(`${cardId} ${accountId ?? '(global)'}`), show(), answer(null))
    }
  });

  // What the plugin has put on its cards, written out under the panel, since a browser has no overlay to draw them on.
  function show() {
    const out = document.getElementById('preview-cards');
    if (!out) return;
    const lines = [`Minute ${minute} of the made-up game. Cards the plugin has set:`];
    for (const [key, content] of cards) {
      lines.push(`[${key}] ${content.summary ?? ''}`);
      for (const row of content.rows ?? []) lines.push(`    ${row.label}: ${row.value}${row.progress == null ? '' : ` (${row.progress})`}`);
    }
    out.textContent = lines.join('\n');
  }

  // For trying things by hand from the browser's console: previewStore() shows what the plugin has saved, and
  // previewToggle('a2') closes or reopens an account.
  window.previewStore = () => Object.fromEntries(store);
  window.previewToggle = id => {
    const account = find(id);
    account.isOpen = !account.isOpen;
    for (const callback of listeners.accounts) callback();
  };

  setInterval(advance, TICK_MS);
})();
