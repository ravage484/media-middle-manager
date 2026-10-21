<p align="center">
  <img src="public/favicon.svg" alt="Media Middle Manager logo" height="96">
</p>

<h1 align="center">Media Middle Manager</h1>

<p align="center">
  Browse your Radarr and Sonarr libraries as posters, then remove titles <em>everywhere</em> in one step, without anything trying to re-download them.
</p>

> [!WARNING]
> **Early testing. Not ready for production.** This tool deletes media files and removes requests and torrents. Expect rough edges and breaking changes, and try it on a few throwaway titles first.

---

## Why this exists

Deleting a movie from Plex is easy. Deleting it so it **stays deleted** is not. The request is still in Overseerr, the title is still monitored in Radarr or Sonarr (so it gets searched again), and the torrent is still seeding in qBittorrent.

Media Middle Manager walks the whole stack for you, and keeps the history in Radarr and Sonarr so you still have a record that you once had the title.

## Features

**Browse**
- Poster library built from every Radarr and Sonarr instance you connect (1080p and 4K servers are merged into one title).
- Tile, grid and list views, with paging (250 titles per page by default).
- Search, plus multi-select filters for type, status, instance, drive/root folder, genre and **tags** from Radarr and Sonarr.
- Sort by total size, size per episode, episode count, title, date added, year, last watched or play count. Find what is eating your disks.
- Size range filter and a running total for whatever the filters match.
- Click a title for a details window: overview, genres, tags, size, status, watch history and the folder each instance manages.

**Watch history** (optional)
- Last watched and play counts from **Tautulli** (all Plex users) or **Plex** (token owner only).
- "Never watched" and "Not watched in N days" filters, Maintainerr-style.

**Delete**
- Multi-select with shift-click ranges, select page, or select everything that matches.
- A review window lists exactly what will be touched (requests, files, torrents) before anything happens.
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

The `proxmox/` folder has a [community-scripts](https://github.com/community-scripts/ProxmoxVE) style installer that creates an unprivileged Debian LXC with Node.js, builds the app and runs it as a systemd service. See [proxmox/README.md](proxmox/README.md). It is untested on a real host, and it cannot download from a private repository, so while this repo is private use the manual install.

### Manual

Requires Node.js 20 or newer.

```bash
git clone https://github.com/ravage484/media-middle-manager.git   # private for now: needs your GitHub login
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

**Keep the key.** Without it the stored keys cannot be recovered; you would re-enter them under Settings. The app refuses to start with a clear message if the key does not match the stored data, rather than quietly breaking every service. To move from the key file to the environment variable, set `MMM_SECRET_KEY` to the contents of `secret.key`; nothing needs re-encrypting. A database backup restores only on an install that has the same key.

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

**Restoring replaces all services, history and accounts**, so you sign in afterwards with the account stored in the backup, and everyone is signed out. Sessions are never restored. Before it replaces anything, the app saves your current database as `pre-restore-<timestamp>.db` in the data folder, and it refuses files that are damaged, from a different schema version, contain no account, or hold keys encrypted with a different key than this install uses. The keys inside a backup are encrypted, so the backup is only useful together with the install's key (`secret.key` or `MMM_SECRET_KEY`): back that up separately and somewhere else. The file also contains your password hash, so keep it private.

## Security

**Sign-in.** The first time you open the app it asks you to create an account. After that, every API call needs a signed-in session.

- Passwords are at least 10 characters and stored as salted scrypt hashes.
- Sessions use a random token in an `HttpOnly`, `SameSite=Strict` cookie (marked `Secure` over HTTPS). Only a hash of the token is stored, and sessions last 14 days from last use.
- Repeated failed logins from one address or against one username are slowed down, then locked for up to 15 minutes.
- Changing your password signs out every other session.
- State-changing requests that name a different origin are rejected.

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

Service logos shown in the Settings page belong to their respective owners (Radarr, Sonarr, Prowlarr, Overseerr, qBittorrent, Plex, Tautulli) and are used only to identify those services. This project is not affiliated with or endorsed by any of them.

## License

Add a `LICENSE` file before publishing. MIT is a common choice for a project like this.
