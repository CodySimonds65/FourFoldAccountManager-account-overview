// Types for window.fourfold, the API FourFold Account Manager gives a plugin's page.
//
// Describes plugin API version 3. The current copy of this file is in the plugin template:
//   https://github.com/CodySimonds65/FourFoldAccountManager-plugin-template/blob/main/fourfold.d.ts
// The API is documented in full in PLUGIN_AUTHORS.md:
//   https://github.com/CodySimonds65/FourFoldAccountManager/blob/main/PLUGIN_AUTHORS.md
//
// This file is for your editor only. FourFold provides window.fourfold itself, before your scripts run, and never
// serves a .ts file, so this file is not part of your plugin and the hub leaves it out of the package.
//
// Many values can be null. With the template's jsconfig.json an editor shows `number | null` as plain `number`, so
// each field's description says when it is null. Read it before you use a value.

declare namespace FourFold {
  /**
   * The `code` on the `Error` a refused call rejects with.
   *
   * - `invalid-argument`: a parameter is missing or wrong, such as an unknown account id or a bad key, URL, header
   *   or method.
   * - `not-declared`: `cards.set` or `cards.clear` for a card id that isn't in `plugin.json`.
   * - `site-not-allowed`: a web request or link to a site the plugin isn't allowed to contact.
   * - `limit-exceeded`: a size, rate or count limit was passed.
   * - `unavailable`: FourFold couldn't do it right now.
   */
  type ErrorCode = 'invalid-argument' | 'not-declared' | 'site-not-allowed' | 'limit-exceeded' | 'unavailable';

  /**
   * What a refused call rejects with. `message` says which rule was broken.
   *
   * @example
   * fourfold.storage.set('goals', goals).catch(error => console.warn(error.code, error.message));
   */
  interface ApiError extends Error {
    /** Which kind of rule was broken. */
    code: ErrorCode;
  }

  /** Stops the callback that an `on...` call registered. */
  type Unsubscribe = () => void;

  /** One of the user's accounts. */
  interface Account {
    /** The account's id. Pass it to the other calls. */
    id: string;
    /** The account's label in FourFold. */
    label: string;
    /**
     * The account's public in-game name. `null` unless the user has filled in that account's Ranking username.
     * When it is set, this is the name read from the account's profile page, or the Ranking username itself until
     * the profile has been read. It never comes from the saved login.
     */
    inGameName: string | null;
    /** `true` while the account's game is open. */
    isOpen: boolean;
  }

  /** One class's level and XP. */
  interface ClassXp {
    /** The class's name. */
    className: string;
    /** The class's level. */
    level: number;
    /** XP earned so far toward the next level. */
    currentXp: number;
    /** XP the current level needs in total. */
    nextLevelXp: number;
  }

  /**
   * An account's XP, as FourFold's own XP tracker reads it: about once a minute, and only while the account is
   * open. For a closed account, and for an open one that hasn't been read yet, the number and text fields are
   * `null`, `classes` is empty and `isStale` is `true`.
   */
  interface Xp {
    /** The active class. `null` until the account has been read, and for a closed account. */
    className: string | null;
    /** The active class's level. `null` until the account has been read, and for a closed account. */
    level: number | null;
    /** XP earned so far toward the next level. `null` until the account has been read, and for a closed account. */
    currentXp: number | null;
    /** XP the current level needs in total. `null` until the account has been read, and for a closed account. */
    nextLevelXp: number | null;
    /** `nextLevelXp - currentXp`. `null` when either is unknown. */
    xpUntilNextLevel: number | null;
    /** At the current XP/hr. `null` when there is no rate yet. */
    hoursUntilNextLevel: number | null;
    /** The current rate. `null` until there is enough data for one. */
    xpPerHour: number | null;
    /** XP gained this session. `0` when unknown. */
    sessionXp: number;
    /** Every class. May be empty. */
    classes: ClassXp[];
    /** Time of the last successful read, as an ISO 8601 date. `null` before the first one, and for a closed account. */
    updatedAt: string | null;
    /** `true` when there is no XP data yet, when the last read failed, and for a closed account. */
    isStale: boolean;
  }

  /**
   * What the active class has equipped. Each slot is worded as the profile page words it, at most 64 characters,
   * or `null` when unknown. An empty slot comes through as the page's own word for it (`Empty`, say), not `null`.
   */
  interface Equipment {
    /** The armor slot. `null` when unknown. */
    armor: string | null;
    /** The helmet slot. `null` when unknown. */
    helmet: string | null;
    /** The hair slot. `null` when unknown. */
    hair: string | null;
    /** The weapon slot. `null` when unknown. */
    weapon: string | null;
  }

  /** The active class's stats. */
  interface Stats {
    /** The active class. */
    className: string;
    /** The active class's level. */
    level: number;
    /** HP. `null` when unknown. */
    hp: number | null;
    /** SP. `null` when unknown. */
    sp: number | null;
    /** Attack. `null` when unknown. */
    attack: number | null;
    /** Magic. `null` when unknown. */
    magic: number | null;
    /** Skill. `null` when unknown. */
    skill: number | null;
    /** Speed. `null` when unknown. */
    speed: number | null;
    /** Luck. `null` when unknown. */
    luck: number | null;
    /** Defense. `null` when unknown. */
    defense: number | null;
    /** Resistance. `null` when unknown. */
    resistance: number | null;
    /** What the class has equipped. Needs `"apiVersion": 2` in `plugin.json`. */
    equipment: Equipment;
  }

  /**
   * Facts from an account's public profile page. They come from the same read as XP: about once a minute, for
   * open accounts only. After a failed read `silver`, `gold`, `location` and `updatedAt` keep their last values and
   * `isStale` is `true`. For a closed account the number and text fields are `null`.
   */
  interface Profile {
    /** The account's silver. `null` until the account has been read, and for a closed account. */
    silver: number | null;
    /** The account's gold. `null` until the account has been read, and for a closed account. */
    gold: number | null;
    /**
     * Where the character is, as the profile page words it. At most 64 characters. `null` until the account has
     * been read, and for a closed account.
     */
    location: string | null;
    /**
     * The account's public player id. Like `inGameName`, it is `null` unless the user has filled in that
     * account's Ranking username, and until the profile has been read under that name.
     */
    playerId: number | null;
    /**
     * Time of the last successful read, as an ISO 8601 date. It only changes with a new read. `null` before the
     * first one, and for a closed account.
     */
    updatedAt: string | null;
    /** `true` when there is no data yet, when the last read failed, and for a closed account. */
    isStale: boolean;
  }

  /** One lap of the timer. */
  interface Lap {
    /** The lap's number. */
    number: number;
    /** How long this lap took, in milliseconds. */
    lapMs: number;
    /** The time on the timer when this lap ended, in milliseconds. */
    totalMs: number;
  }

  /** FourFold's timer. */
  interface Timer {
    /** Whether the timer is waiting to start, running, or stopped at its final time. */
    state: 'ready' | 'running' | 'finished';
    /** The time on the timer when you asked. Animate from it yourself: there are no tick events. */
    elapsedMs: number;
    /** The laps so far. Empty when there are none. */
    laps: Lap[];
  }

  /** Options for `http.fetch`. */
  interface HttpRequest {
    /** `GET` (the default) or `POST`. */
    method?: 'GET' | 'POST';
    /**
     * Header names and values. `Cookie`, `Host`, `Content-Length`, `Transfer-Encoding`, `Connection`, `Proxy-*`
     * and `Sec-*` are dropped. FourFold sends `User-Agent: FourFold-Plugin/1` unless you set your own.
     */
    headers?: Record<string, string>;
    /**
     * A string, so `JSON.stringify` an object yourself. Ignored for `GET`. Sent as UTF-8 with a `text/plain`
     * content type unless you set `Content-Type` in `headers`.
     */
    body?: string;
  }

  /** The answer to `http.fetch`. */
  interface HttpResponse {
    /** The HTTP status. A `404` or `500` still resolves, so check it. */
    status: number;
    /** The response headers, without `Set-Cookie`. Names come in whatever case the server used. */
    headers: Record<string, string>;
    /** The body read as UTF-8, so it only suits text. */
    text: string;
  }

  /** One row of a card: label on the left, value on the right. */
  interface CardRow {
    /** At most 40 characters. */
    label: string;
    /** At most 40 characters. Convert numbers with `String()`: anything that isn't a string is drawn empty. */
    value: string;
    /** A number from 0 to 1 draws a thin bar under the row. Leave it out, or pass `null`, for no bar. */
    progress?: number | null;
  }

  /** What a card shows. */
  interface CardContent {
    /** At most 40 characters. Shown in the Overlays panel beside the card's switch, not on the card. */
    summary?: string;
    /** At most 8 rows. A card with no rows shows "No data yet". */
    rows?: CardRow[];
  }

  /** FourFold's colors as hex strings. Each is also a CSS variable on `:root`, such as `--ff-surface-raised`. */
  interface Theme {
    /** `--ff-background` */
    background: string;
    /** `--ff-surface` */
    surface: string;
    /** `--ff-surface-raised` */
    surfaceRaised: string;
    /** `--ff-border` */
    border: string;
    /** `--ff-text` */
    text: string;
    /** `--ff-text-muted` */
    textMuted: string;
    /** `--ff-accent` */
    accent: string;
    /** `--ff-danger` */
    danger: string;
  }

  /** Copied from your `plugin.json`. */
  interface PluginInfo {
    /** The plugin's `id`. */
    id: string;
    /** The plugin's `version`, such as `1.0.0`. */
    version: string;
    /** The `apiVersion` the plugin declares. */
    apiVersion: number;
  }

  /** What the live game feed reports when a fight starts. */
  interface LiveBattleStarted {
    accountId: string;
    enemyCount: number;
    /** When the app received it (ISO 8601, UTC). */
    at: string;
  }

  /**
   * A fight ended. The game doesn't say whether it was won: a win is a `battle.result` that follows, and an end with
   * no result is an escape or a loss.
   */
  interface LiveBattleEnded {
    accountId: string;
    at: string;
  }

  interface LiveStatGains {
    maxHp: number;
    maxSp: number;
    hp: number;
    sp: number;
    att: number;
    mag: number;
    skl: number;
    spd: number;
    def: number;
    res: number;
    lck: number;
  }

  /** A fight's reward, as the game showed it. `expGained` already includes any double-XP event. */
  interface LiveBattleResult {
    accountId: string;
    expGained: number;
    silverGained: number;
    expNeededToNextLevel: number;
    leveledUp: boolean;
    reachedLevel: number;
    className: string | null;
    /** Comma-joined when several unlock at once; at most 64 characters. */
    unlockedSkillName: string | null;
    statGains: LiveStatGains;
    at: string;
  }

  /** A skill's outcome. One roll per cast: a miss misses every target. */
  interface LiveSkillResult {
    accountId: string;
    skillName: string | null;
    outcome: 'hit' | 'miss' | 'rejected';
    targetsAffected: number;
    reason: string | null;
    at: string;
  }

  /** Where an account is: the game's own scene name, such as `westhills_b2_dungeon_01`. */
  interface LiveLocation {
    accountId: string;
    scene: string | null;
    inBattle: boolean;
    at: string;
  }

  interface LiveSession {
    accountId: string;
    at: string;
  }

  /**
   * The game connection ended: a kick (with the server's reason), a reload or a closed panel (`reason` null). It also
   * ends any open fight: a fight cut off by a reload never gets `battle.onEnded`, and after the re-login the game
   * resumes it with a new `battle.onStarted`.
   */
  interface LiveDisconnect {
    accountId: string;
    reason: string | null;
    at: string;
  }

  /** Whether live events are flowing. `unavailable` comes with a reason, such as a game update FourFold can't read yet. */
  interface LiveStatus {
    state: 'active' | 'off' | 'unavailable';
    reason: string | null;
  }

  /**
   * `window.fourfold`. Every call returns a promise. A call that is refused rejects with an {@link ApiError},
   * and a rejected call never stops your plugin.
   */
  interface Api {
    /** Your plugin's id, version and API version, copied from `plugin.json`. */
    readonly plugin: Readonly<PluginInfo>;
    /** FourFold's colors. The palette is fixed while the plugin runs. */
    readonly theme: Readonly<Theme>;

    /** The user's accounts. */
    readonly accounts: {
      /** Every account the user has in FourFold, open or closed. */
      list(): Promise<Account[]>;
      /**
       * Calls `callback` when an account is added, removed, relabeled, opened or closed. The callback gets no
       * data. A change to `inGameName` alone doesn't fire it.
       */
      onChanged(callback: () => void): Unsubscribe;
    };

    /** An account's class, level and XP rate. */
    readonly xp: {
      /** An account's XP. An id that isn't one of the user's accounts is rejected with `invalid-argument`. */
      get(accountId: string): Promise<Xp>;
      /**
       * Calls `callback` when that account's XP data changes, about once a minute for each open account. It fires
       * once per account, so several can arrive together: run your redraws one after another.
       */
      onUpdated(callback: (event: { accountId: string }) => void): Unsubscribe;
    };

    /** The active class's stats and equipment. */
    readonly stats: {
      /**
       * The active class's stats, or `null` when the account is closed or hasn't been read yet. There is no stats
       * event: read it again when `xp.onUpdated` fires. An unknown account id is rejected with `invalid-argument`.
       */
      get(accountId: string): Promise<Stats | null>;
    };

    /** Silver, gold, location and player id. Needs `"apiVersion": 2` in `plugin.json`. */
    readonly profile: {
      /**
       * Silver, gold, location and player id from the account's public profile page. Needs `"apiVersion": 2` in
       * `plugin.json`. There is no profile event: read it again when `xp.onUpdated` fires, and compare `updatedAt`
       * to tell a new read from another change. An unknown account id is rejected with `invalid-argument`.
       */
      get(accountId: string): Promise<Profile>;
    };

    /** FourFold's timer. */
    readonly timer: {
      /** The timer's state, the time on it and its laps. */
      get(): Promise<Timer>;
      /** Calls `callback` when the timer starts, splits, finishes or resets. It doesn't fire on every tick. */
      onChanged(callback: () => void): Unsubscribe;
    };

    /** Web requests made by FourFold on the plugin's behalf. */
    readonly http: {
      /**
       * Makes a web request from FourFold, not from your page, so it isn't subject to CORS. The site must be in
       * your `sites` (or any `https` site if the plugin has `anySite` and FourFold honors it), or the call is
       * rejected with `site-not-allowed`. No cookies are kept or sent.
       *
       * Limits: 60 requests a minute (each redirect counts), 5 redirects, a 15 second timeout, a 2 MB response.
       */
      fetch(url: string, options?: HttpRequest): Promise<HttpResponse>;
    };

    /**
     * Opens an `https` link in the user's default browser. The link must be on one of the plugin's `sites`, or on
     * any public host if the plugin has `anySite` and FourFold honors it (`site-not-allowed` otherwise). It works
     * only while the plugin's panel is showing, and only right after the user clicks or presses a key in your page
     * (`unavailable` otherwise). At most one link every 2 seconds.
     */
    openExternal(url: string): Promise<void>;

    /**
     * The plugin's private key-value store, kept between runs. Keys are 1 to 64 characters. Everything a plugin
     * stores is capped at 256 KB, and `set` and `remove` together at 120 a minute (`limit-exceeded`).
     */
    readonly storage: {
      /** The value saved under `key`, or `null` if there is none. */
      get(key: string): Promise<any>;
      /** Saves any JSON value. `undefined` is rejected with `invalid-argument`. */
      set(key: string, value: unknown): Promise<void>;
      /** Deletes a key. */
      remove(key: string): Promise<void>;
    };

    /** Fills and empties the overlay cards declared under `cards` in `plugin.json`. FourFold draws them. */
    readonly cards: {
      /**
       * Fills a card. `accountId` is one of the user's account ids for an `account` card, and `null` for a
       * `global` card. A card id that isn't in `plugin.json` is rejected with `not-declared`. Text that is too
       * long, or too many rows, is rejected with `limit-exceeded`; text with line breaks or other control
       * characters with `invalid-argument`.
       */
      set(cardId: string, accountId: string | null, content: CardContent): Promise<void>;
      /** Empties a card. `accountId` is as for `set`: an account id for an `account` card, `null` for a `global` one. */
      clear(cardId: string, accountId: string | null): Promise<void>;
    };

    /**
     * Live fights from the user's own game panels, as they happen. API 3, and only while FourFold's live game feed
     * is on: check `live.getStatus()`. On an older FourFold this namespace doesn't exist.
     */
    readonly battle: {
      onStarted(callback: (event: LiveBattleStarted) => void): Unsubscribe;
      onEnded(callback: (event: LiveBattleEnded) => void): Unsubscribe;
      onResult(callback: (event: LiveBattleResult) => void): Unsubscribe;
      onSkillResult(callback: (event: LiveSkillResult) => void): Unsubscribe;
    };

    /** Where each account is, from the live game feed. API 3. */
    readonly location: {
      /** The account's current scene, or `null` with no live data for it. An unknown id is rejected with `invalid-argument`. */
      get(accountId: string): Promise<LiveLocation | null>;
      onChanged(callback: (event: LiveLocation) => void): Unsubscribe;
    };

    /** Game logins and disconnections, from the live game feed. API 3. */
    readonly session: {
      /** A successful login only. */
      onLoggedIn(callback: (event: LiveSession) => void): Unsubscribe;
      onDisconnected(callback: (event: LiveDisconnect) => void): Unsubscribe;
    };

    /** The live game feed's status. API 3. */
    readonly live: {
      getStatus(): Promise<LiveStatus>;
      onStatusChanged(callback: (status: LiveStatus) => void): Unsubscribe;
    };
  }
}

/** The API FourFold gives your plugin's page. It is there before your scripts run, and it is frozen. */
declare const fourfold: FourFold.Api;

interface Window {
  /** The same object as the global `fourfold`. */
  readonly fourfold: FourFold.Api;
}
