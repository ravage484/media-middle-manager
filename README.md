<p align="center">
  <img src="public/favicon.svg" alt="Media Middle Manager logo" height="96">
</p>

<h1 align="center">Media Middle Manager</h1>

<p align="center">
  One place to browse and manage your whole media stack: your Radarr and Sonarr libraries, with Overseerr, qBittorrent, Tautulli and Plex alongside.
</p>

> [!WARNING]
> **Early testing. Not ready for production.** Some actions, such as removing a title or episodes, delete media files and remove requests and torrents. Expect rough edges and breaking changes, and try it on a few throwaway titles first.

---

## What it is

Running a media stack means juggling five or six apps, each with its own view of the same title. Media Middle Manager sits above them and gives you a single, poster-based view of your library, with the details from every service in one place: ratings, files, tags, sizes, watch history and where each title is managed.

It started with the part that is hardest to do by hand, **keeping the library tidy**. Removing a movie from Plex is easy, but removing it so it *stays* removed is not: the request is still in Overseerr, the title is still monitored in Radarr or Sonarr (so it gets searched again), and the torrent is still seeding in qBittorrent. The app walks the whole stack for you and keeps the history in Radarr and Sonarr, so you still have a record that you once had the title.

**Today** you can browse, search, filter and sort the whole library, inspect any title, and clean up whole titles or single episodes. **Next** is the other direction: searching for and requesting new media through Overseerr, then managing tags and more from the same screen (see the [roadmap](#roadmap)).

## Features

**Browse**
- Poster library built from every Radarr and Sonarr instance you connect (1080p and 4K servers are merged into one title).
- Tile, grid and list views, with paging (250 titles per page by default).
- Search, plus multi-select filters for type, status, instance, drive/root folder, genre and **tags** from Radarr and Sonarr.
- Sort by total size, size per episode, episode count, title, date added, year, **rating**, last watched or play count. Rating is one score per title from Radarr/Sonarr (a movie's IMDb or TMDB score, whichever has more votes; a show's Sonarr score), weighted by vote count so one perfect vote does not top the list, shown in the list view's Rating column and on tiles while sorted by it. Find what is eating your disks.
- Size range filter and a running total for whatever the filters match.
- Click a title for a details window styled like a request page: a backdrop header with an availability badge, the overview and tags, **ratings** (IMDb, TMDB, Rotten Tomatoes and Metacritic for movies from Radarr; TMDB and Rotten Tomatoes for shows from Overseerr, or Sonarr's single unnamed score when Overseerr is not set up), shown with their logos, status, release or air dates, runtime, language, network or studio, external links, and each instance's folder. For a show, every season is listed as an expandable bar with its episode count and whether it is available, partially available or missing.

**Recommendations** (optional, needs Overseerr)
- At the bottom of a title's window, a row of **Recommendations** and **Similar** titles from Overseerr (TMDB), like its own title pages. Each card shows its poster, rating and whether you already have it (*In library*, *Available*, *Partial*, *Requested*). A card for something you own opens it here; any other opens its TMDB page. *Show more* loads further pages.

**Plex actions from each title** (optional)
- Hover a poster (or use the last column in the list view) and click the **...** button for a menu like Plex's own, without anything that plays: **Add to collection...**, **Add to playlist...**, **Mark as watched / unwatched**, **Refresh metadata** and **Analyze**, plus **Details** and **Delete...**.
- The collection and playlist windows list what exists, with the title's current ones ticked. Tick to add, untick to remove, or create a new one with the title already in it. Smart collections and playlists are not offered, because Plex fills them itself.
- A title is found in Plex by its TMDB or TVDB id (or title and year). If it is in more than one Plex library, such as Movies and a second movie library, watched state, refresh and analyze are applied to each, and collections are chosen per library.
- Watched state and playlists belong to the account the Plex token is for (the server owner, normally).
- What Plex says about each title (in Plex or not, watched, its collections and playlists) is cached in the database, so the **Collections** and **Playlists** filters work in the library and the menu opens instantly; opening a title also re-checks that one title with Plex. The cache is read by **Settings > Library sync > Plex data**, on the same checks and schedule as the keywords, or by hand.
- **Plex webhook (needs Plex Pass):** the app detects whether the Plex account has Plex Pass and only offers the setting when it does. Add the address shown in Settings under *app.plex.tv > Settings > Webhooks*; added, finished and rated events refresh the cache within about half a minute. Plex does not announce collection or playlist edits made inside Plex, so those appear at the next read or when you open the title.

**Keywords from Overseerr** (optional)
- Overseerr shows TMDB keywords on every title page (*detective*, *island*, *heist*...). With Overseerr connected, the library gets a searchable **Keywords** filter built from them, so you can organize your media by theme.
- Keeping them current is set under **Settings > Library sync**, and runs on the server even with the browser closed:
  - **Manually:** *Load missing keywords* fetches only titles that have none; *Refresh everything* re-fetches all of them. Both show progress and can be stopped.
  - **Checking for new titles:** every 5, 15 or 60 minutes the app looks at Radarr/Sonarr and fetches keywords for titles it has not seen (on by default).
  - **On a schedule:** a full refresh daily, weekly (the default) or monthly. The first run loads your whole library, which can take a while.
  - **Instantly, with a webhook (off by default):** add a *Webhook* connection in Radarr and Sonarr (*Settings > Connect*), triggers *On Import* plus *On Movie Added* or *On Series Add*, method POST, pointed at the address shown in Settings. New titles then get their keywords within seconds. The address carries a secret token (also accepted as an `X-Webhook-Token` header or the Basic-auth password); the call only prompts a re-check, and nothing in its body is used.
- A title's window shows its keywords as chips beside your Radarr/Sonarr tags; click one to filter the library by it. The window also shows production countries and where the title streams (country set by `MMM_REGION`, default `US`).

**Watch history** (optional)
- Last watched and play counts from **Tautulli** (all Plex users) or **Plex** (token owner only).
- "Never watched" and "Not watched in N days" filters, Maintainerr-style.

**Delete**
- Multi-select with shift-click ranges, select page, or select everything that matches.
- A review window lists exactly what will be touched (requests, files, torrents) before anything happens.
- **Delete individual episodes.** Open a show's details, choose *Choose episodes to delete…*, and tick episodes or whole seasons (shift-click for a range). Only those episodes are unmonitored and their files deleted; the rest of the show stays.
- Per-step results afterwards, and a **History** tab recording every deletion and the space freed.

**Make it yours**
- 12 color themes, 10 necktie logo styles, and 8 bundled fonts (no CDN, works offline).
- Collapsible side navigation, and per-browser defaults for the delete window.

**Back up and move**
- Export your settings to a JSON file and import them into another install (see [Import and export](#import-and-export)).

## What Delete does

For each selected title, in this order:

1. **Overseerr**: delete the request(s) and reset the media record (or mark them declined).
2. **Radarr / Sonarr**: unmonitor the movie, or the series and all of its episodes. The entry and its history stay.
3. **Radarr / Sonarr**: delete the media file(s) through the file endpoints. It deliberately does not use "delete movie/series", which would erase the history. This step is **skipped if unmonitoring failed**, because deleting a monitored file would trigger a re-download.
4. **qBittorrent**: remove the torrents (found through the Arr's download history) together with their data, so seeding or hardlinked copies do not keep using disk.
5. **Plex** (optional): rescan the movie and show libraries.
6. Record the result in the database (shown on the History tab).

Prowlarr can be added for a connection test, but the delete workflow does not use it.

### Deleting individual episodes

In a show's details window, *Choose episodes to delete…* lists every season and episode for each Sonarr that manages the show, with size, quality and air date. Ticking a season ticks every episode in it that has a file. The review window then shows what will happen, and the server re-checks everything when you press Delete. For the chosen episodes it does the same as a whole-show delete, in the same order and with the same safety rule:

1. **Unmonitor** those episodes in Sonarr (their history stays).
2. **Delete their files**, but only for a Sonarr where step 1 worked.
3. **Remove torrents only when nothing else needs them.** This is the part that needs care, because a season pack serves many episodes:
   - A torrent is removed only if **every** episode Sonarr has linked to it is also being deleted, or has no file any more. Choose one episode of a pack and the pack stays, and the review lists which episodes still need it.
   - A download that **another show** also uses is never removed.
   - If Sonarr cannot say what else uses a download (an error, or an incomplete answer), the torrent is kept.
   - If any file failed to delete, no torrent is removed.
4. Optionally rescan Plex, then record the result in the History tab (marked *Episodes*).

Other things to know:

- **Overseerr is not touched.** The show is still in your library, so its request stays valid. To remove a show completely, use Delete on the show itself.
- **Double episodes** (one file holding `S01E04-E05`) must be chosen together, because deleting the file removes both. Ticking one half ticks the other, and the server refuses a selection that splits a file.
- Episodes that have no file are shown greyed out and cannot be ticked.
- This works for shows (Sonarr) only. Movies are a single file, so Delete already covers them.

### What is required?

| Service | Needed? | What you lose without it |
|---|---|---|
| Radarr and/or Sonarr | **Required** | There is no library to browse |
| Overseerr | Recommended | Requests are not removed and titles can show as available |
| qBittorrent | Recommended | Torrent data may keep using disk space |
| Tautulli / Plex | Optional | No watch history filters; no Plex rescan |
| Prowlarr | Optional | Nothing. Connection test only |

## Install

### Proxmox VE helper script

The `proxmox/` folder has a [community-scripts](https://github.com/community-scripts/ProxmoxVE) style installer that creates an unprivileged Debian LXC with Node.js, builds the app and runs it as a systemd service. See [proxmox/README.md](proxmox/README.md). It is untested on a real host, so expect to fix something on the first run.

### Manual

Requires Node.js 20 or newer.

```bash
git clone https://github.com/ravage484/media-middle-manager.git
cd media-middle-manager
npm ci
npm run build
npm start
```

Open <http://localhost:3001>, go to **Settings > Services**, and add your connections.

### Development

```bash
npm ci
npm run dev
```

The UI runs on <http://localhost:5173> with hot reload, and proxies `/api` to the server on port 3001.

## Configuration

Everything is configured in the UI under **Settings**. The server is configured with environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | Port to listen on |
| `DATA_DIR` | `./data` | Where the database (`mmm.db`) is stored |
| `MMM_SECRET_KEY` | unset | Encryption key for stored API keys: base64 of 32 random bytes, or any passphrase. If unset, a key is generated into `DATA_DIR/secret.key` (see [Encryption of API keys](#encryption-of-api-keys)) |
| `MMM_ADMIN_USER`, `MMM_ADMIN_PASSWORD` | unset | Create the first account at startup instead of using the setup page (only used while no account exists) |
| `MMM_AUTH_DISABLED` | `false` | `true` turns sign-in off. Only for use behind a proxy that already authenticates users |
| `MMM_HOST` | all interfaces | Address to listen on, for example `127.0.0.1` when a reverse proxy on the same machine is the only client |
| `MMM_REGION` | `US` | Two-letter country whose streaming providers are shown in a title's window |
| `MMM_TRUST_PROXY` | `false` | `true` when behind a reverse proxy, so the real client IP is used for login throttling and HTTPS is detected |

Where each service's credentials come from:

| Service | Use |
|---|---|
| Radarr, Sonarr, Prowlarr | API key (Settings > General) |
| Overseerr | API key (Settings > General) |
| qBittorrent | Web UI username and password |
| Tautulli | API key (Settings > Web Interface) |
| Plex | A Plex token |

### Data and backups

Everything the server stores is in one SQLite file, `mmm.db`, inside `DATA_DIR` (plus `mmm.db-wal` and `mmm.db-shm` while it runs):

| Table | Contents |
|---|---|
| `services` | Your connections. API keys and passwords are stored **encrypted** (see below); names, URLs and usernames are not |
| `history` | One row per deletion, shown on the History tab |
| `users`, `sessions` | Your account (password stored as a salted scrypt hash) and signed-in sessions |

Schema changes are applied automatically at startup, tracked with SQLite's `user_version`.

**Upgrading from the JSON files:** the first start with this version imports an existing `config.json` and `history.json` into the database and renames them to `config.json.migrated` and `history.json.migrated`. They are left in place as a backup. **`config.json.migrated` still holds your API keys in plain text**, so delete it as soon as you have checked that everything works.

### Encryption of API keys

API keys and the qBittorrent password are encrypted with AES-256-GCM before they are written to the database, and decrypted in memory when the server calls Radarr, Sonarr and the rest. Each value gets its own random IV and is bound to its own row and column, so an encrypted value cannot be copied to another service. Anything stored in plain text by an older version is encrypted on the next start, and the old plain text is cleared from the database file.

The key comes from one of two places:

| Source | When | Notes |
|---|---|---|
| `MMM_SECRET_KEY` environment variable | If set | Base64 of 32 random bytes (`openssl rand -base64 32`), or any passphrase. Keeping it outside the data folder (a systemd `EnvironmentFile`, a Docker secret) is the stronger setup |
| `DATA_DIR/secret.key` | Otherwise | Generated automatically on first start with owner-only permissions. Simple, but it sits next to the database |

**What this protects, and what it does not.** The server has to decrypt the keys to use them, so encryption cannot protect against someone who controls the running app or a signed-in session. It does protect the database *on its own*: a copied `mmm.db`, a database backup, or a snapshot of the volume taken without the key. If the key is a file in the same folder, copying the whole data folder gets both, which is why the environment variable is the better choice if you care about this.

**Keep the key.** Without it the stored keys cannot be recovered; you would re-enter them under Settings. The app refuses to start with a clear message if the key does not match the stored data, rather than quietly breaking every service. To move from the key file to the environment variable, set `MMM_SECRET_KEY` to the contents of `secret.key`; nothing needs re-encrypting. A database backup from another install needs that install's key when you restore it: enter it in the restore form (see [Database backup and restore](#database-backup-and-restore)) and it is re-encrypted under this install's key.

**Backing up:** use **Settings > Import / Export**. Its **Database backup** button downloads a complete, consistent copy of the database while the app is running. Copying `mmm.db` by hand is only safe with the app stopped, because recent changes can still be in the `-wal` file.

### Import and export

**Settings > Import / Export** saves your setup to a `.json` file and loads it back, on the same install or a different one.

**Export** lets you choose what goes in the file:

| Option | Default | Notes |
|---|---|---|
| Services (names, URLs) | always | |
| API keys and passwords | off | Turn this on to move to another install. The file then holds your keys in plain text, so keep it private |
| Deletion history | on | |
| Appearance and preferences | on | Theme, logo, font, delete defaults, view and page size from *this browser* |

**Import** shows what is in the file first, then lets you pick a mode:

- **Merge** (default): services that already exist (same type and URL) are updated, new ones are added, and nothing else is touched.
- **Replace**: the file becomes the full list of services.

In both modes, a blank key in the file never erases a key you already have. History entries are matched by id, so importing the same file twice does not create duplicates. Files are validated before anything is written, so a bad file changes nothing.

Exports never contain your account or sessions, so an install you import into keeps its own login.

#### Database backup and restore

The same tab can take a **whole-database backup** (a `.db` file) and restore one. Use it to back up or move the entire install exactly as it is; use the JSON export when you want to pick what to bring across.

| | JSON export | Database backup |
|---|---|---|
| Services and history | yes (keys optional, plain text if included) | yes, always, with keys encrypted |
| Your account | no | yes |
| Browser preferences | yes (optional) | no |
| Merge into an existing install | yes | no, it replaces everything |

**Restoring replaces all services, history and accounts**, so you sign in afterwards with the account stored in the backup, and everyone is signed out. Sessions are never restored. Before it replaces anything, the app saves your current database as `pre-restore-<timestamp>.db` in the data folder, and it refuses files that are damaged, from a different schema version, or contain no account. The file also contains your password hash, so keep it private.

**Restoring a backup from another install.** The API keys inside a backup are encrypted with the key of the install that made it. When you choose a backup file, the form shows an optional **Key of the backup** field. Paste the key there, or press **Load from secret.key** and choose that install's `secret.key` file (use the `MMM_SECRET_KEY` value instead if that install used one). The server reads the backup's keys with it and re-encrypts them under *this* install's own key as it copies them in, so:

- no key file needs to be copied onto the server;
- the key you enter is used once and is never stored or logged (it travels in a request header, not the URL, so use HTTPS if the app is reachable beyond your LAN);
- your existing `secret.key` stays as it was.

A wrong key is refused with a clear message and nothing is changed. Leave the field empty for a backup made by this same install. A backup is only useful together with its install's key, so back that key up separately and somewhere else.

## Security

**Sign-in.** The first time you open the app it asks you to create an account. After that, every API call needs a signed-in session.

- Passwords are 10 to 200 characters, must not equal your username or be one repeated character, and are stored as salted scrypt hashes (N=65536, r=8, p=2). The parameters are stored with each hash, and an older, weaker hash is upgraded the next time its owner signs in.
- Sessions use a random token in an `HttpOnly`, `SameSite=Strict` cookie (marked `Secure` over HTTPS). Only a hash of the token is stored. A session lasts 14 days from last use and never more than 30 days in total.
- Login throttling: one address is cut off after 5 failed attempts, for longer each time (up to 15 minutes). A username is locked for 5 minutes only after 20 failures from any addresses, so a stranger cannot cheaply lock you out, but a distributed guesser still hits a wall. At most two password hashes run at once, so a flood of attempts cannot exhaust memory.
- Failed logins are written to the log with the client address (`journalctl -u media-middle-manager`), so a tool such as fail2ban can act on them. Attacker-supplied text is sanitised so it cannot forge log lines.
- Changing your password signs out every other session.
- State-changing requests that name a different origin are rejected.

**What the server does to protect itself and your services**

- **A Content-Security-Policy** lets the page load scripts, styles and fonts only from the app itself, and connect only to the app. Images may come from anywhere (posters come from the hosts Radarr and Sonarr name). Other headers: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`, cross-origin isolation headers, `Cache-Control: no-store` on every API response, and HSTS when it is served over HTTPS.
- **Your API keys never follow a redirect to another host.** `fetch` only strips the `Authorization` header across origins, so the `X-Api-Key`, Plex token and cookie headers would otherwise be forwarded to whatever a service redirects to. Same-host redirects are followed; any other redirect is refused with an explanation.
- **Input is validated.** Services must be a known type with a plain `http://` or `https://` URL (no `file:`, `data:` or credentials in the URL). Delete and plan requests accept only well-formed title keys, and a delete request with no options does the least destructive thing.
- **Request bodies are capped before sign-in** (100 KB); only an authenticated import may be large (20 MB). Errors are returned as short JSON, never stack traces.
- **Files are private to the app's account.** The data folder is `700` and the database and key file `600` on Linux, and deleted data is overwritten rather than left in free pages.
- **Optional bind address.** `MMM_HOST=127.0.0.1` makes the app listen only on that address, for when a reverse proxy on the same machine is its only client.

**The first visitor creates the account.** Until you set it up, anyone who can reach the page can claim it. On a LAN that is usually fine; if the app is reachable from elsewhere, set `MMM_ADMIN_USER` and `MMM_ADMIN_PASSWORD` so the account exists before the server starts listening.

**Use HTTPS if it is reachable beyond your LAN.** Sessions and passwords are sent in the clear over plain HTTP. Put it behind a reverse proxy that terminates TLS and set `MMM_TRUST_PROXY=true`.

**Forgot your password?** On the machine running the app (with the same `DATA_DIR`):

```bash
npm run reset-password -- admin "a new password, 10+ characters"
```

This sets the password, creates the account if it does not exist, and signs out all sessions. It only works for someone with access to the server's files, which is the point. The password appears in your shell history, so clear it afterwards if that matters.

API keys stay on the server and are never sent to the browser; the Settings page only ever shows them masked. They are encrypted at rest (see [Encryption of API keys](#encryption-of-api-keys)). A JSON export made with "Include API keys" is the exception, because it is plain text by design: delete it once you have used it.

## How it works

A small Express server holds your keys, talks to each service's API and does the delete steps. A React (Vite) frontend talks only to that server. This is also why the app cannot be a static site: browsers cannot call these APIs directly because of CORS, and your keys would sit in the page.

```
Browser (React)  ->  /api  ->  Express  ->  Radarr / Sonarr / Overseerr / qBittorrent / Tautulli / Plex
                                   |
                                   +-> data/mmm.db (SQLite)
```

| Endpoint | Purpose |
|---|---|
| `/api/auth/status`, `setup`, `login`, `logout`, `password` | Account and sessions (everything else below requires a session) |
| `GET /api/library` | Merged library with tags, size and watch data (`?refresh=1` skips the cache) |
| `POST /api/plan` | Preview what a delete would touch |
| `POST /api/delete` | Run the delete steps |
| `GET /api/episodes`, `POST /api/episodes/plan`, `POST /api/episodes/delete` | List a show's episodes, preview, and run a per-episode delete |
| `GET /api/history` | Deletion history |
| `GET/PUT /api/services`, `POST /api/services/test` | Manage and test connections |
| `GET /api/export`, `POST /api/import` | Export and import settings (JSON) |
| `GET /api/backup/db`, `POST /api/restore` | Download and restore a whole-database backup |

### Project layout

```
server/        Express API (lib.js: service clients and the delete workflow, db.js: SQLite, auth.js: sign-in)
src/           React app (Library, Detail, DeleteDialog, Settings, themes, ...)
public/        Favicon and service logos
proxmox/       Proxmox VE helper script files
```

## FAQ

**Will it delete my media from disk?**
Yes, if "Delete media files" is ticked. The review window shows every file path first, and nothing happens until you press Delete.

**Why does a title I deleted still show in Radarr?**
On purpose. It is unmonitored with no file, so you keep the history that you once had it, and Radarr will not search for it.

**Why do some titles show "Not found in Plex/Tautulli"?**
Matching uses TMDB/TVDB ids (Plex) or title and year (Tautulli). A title named differently in your media server may not match.

**Does Plex alone count other users' plays?**
No. Plex only reports plays for the account that owns the token. Use Tautulli for accurate "nobody watched this" results.

## Roadmap

- Search and request new media (through Overseerr)
- Use a tag such as `keep` to protect titles from deletion
- Edit Radarr and Sonarr tags from the library
- Multiple users and roles

## Credits and trademarks

Service logos shown in the Settings page belong to their respective owners (Radarr, Sonarr, Prowlarr, Overseerr, qBittorrent, Plex, Tautulli), and so do the rating marks shown in a title's window (IMDb, TMDB, Rotten Tomatoes, Metacritic; the artwork comes from the CC0 [Simple Icons](https://simpleicons.org) set) and are used only to identify those services. This project is not affiliated with or endorsed by any of them.

## License

Add a `LICENSE` file before publishing. MIT is a common choice for a project like this.
