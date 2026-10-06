# Account overview

A plugin for [FourFold Account Manager](https://github.com/CodySimonds65/FourFoldAccountManager). It shows every
account at a glance: class, level, XP per hour, silver, gold and where the character is, with totals across accounts.
An open account that was earning and then earns nothing for 5 minutes is marked "Idle", so you notice one that has
stopped. An account that hasn't earned anything since it was opened, a bank account say, is left alone.

It is listed on the [plugin hub](https://github.com/CodySimonds65/FourFoldAccountManager-plugin-hub), so FourFold
users install it from the plugin list: the wrench in the plugin strip, then **Plugin hub**.

## What to know

- FourFold reads an account about once a minute, and only while its game is open. The numbers are as fresh as that.
- A closed account shows the values from its last read while this plugin was running, and how long ago that was.
  Those values are counted in the total silver and gold, and the panel says so.
- XP per hour is FourFold's own XP tracker rate. Silver per hour is worked out here, over the last hour, counting
  silver earned only: spending doesn't lower it.
- "Stale" means FourFold has no fresh read for an open account, so the plugin can't tell whether it is idle.
- One overlay card, "Accounts", shows the totals and the names of idle accounts.

## For plugin authors

The working-out is in `overview.mjs`, which touches neither the page nor `window.fourfold`, so it can be checked
outside FourFold. `app.js` reads the API and draws. To start your own plugin, use the
[plugin template](https://github.com/CodySimonds65/FourFoldAccountManager-plugin-template); the API is documented in
[PLUGIN_AUTHORS.md](https://github.com/CodySimonds65/FourFoldAccountManager/blob/main/PLUGIN_AUTHORS.md).

## Run it from source

1. In FourFold, open the plugin list (the wrench in the plugin strip), switch on **Developer mode**, and press
   **Open dev plugins folder**.
2. Clone this repository into that folder.

While developer mode is on, the copy in the dev folder runs instead of the one installed from the hub. It uses the
same saved data.

## Checks

All need Node.js.

```bash
node .check/overview.check.mjs
```

```bash
npx -p typescript tsc -p jsconfig.json
```

The first checks the working-out. The second checks the scripts against `fourfold.d.ts`, which comes from the plugin
template along with `jsconfig.json`.

To look at the panel without FourFold, on made-up data:

```bash
python -m http.server 8765
```

then open `http://localhost:8765/.check/preview.html` in a window about 250 pixels wide. `.check/` is left out of the
hub's package, because its name starts with a dot.

## License

[Apache 2.0](LICENSE).
