<p align="center">
  <img src="public/favicon.svg" alt="Media Middle Manager logo" height="96">
</p>

<h1 align="center">Media Middle Manager</h1>

<p align="center">
  Browse your Radarr and Sonarr libraries as posters, then remove titles <em>everywhere</em> in one step, without anything trying to re-download them.
</p>

> [!WARNING]
> **Early testing. Not ready for production.** This tool deletes media files and removes requests and torrents. Expect rough edges and breaking changes, and try it on a few throwaway titles first. It has no login.

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
6. Record the result in `history.json`.

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
| `DATA_DIR` | `./data` | Where `config.json` and `history.json` are stored |

Where each service's credentials come from:

| Service | Use |
|---|---|
| Radarr, Sonarr, Prowlarr | API key (Settings > General) |
| Overseerr | API key (Settings > General) |
| qBittorrent | Web UI username and password |
| Tautulli | API key (Settings > Web Interface) |
| Plex | A Plex token |

### Data and backups

Your connections and deletion history are in `DATA_DIR`:

- `config.json` holds your services and **API keys in plain text**, so keep it private.
- `history.json` is the log shown on the History tab.

Back those two files up and you can restore everything on a fresh install.

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

You can also copy `config.json` and `history.json` in `DATA_DIR` by hand.

## Security

**There is no login.** Anyone who can reach the page can delete media. Run it on your LAN only, or put it behind a reverse proxy that adds authentication (Authelia, Authentik, Caddy basic auth, and so on).

API keys stay on the server and are never sent to the browser; the Settings page only ever shows them masked.

## How it works

A small Express server holds your keys, talks to each service's API and does the delete steps. A React (Vite) frontend talks only to that server. This is also why the app cannot be a static site: browsers cannot call these APIs directly because of CORS, and your keys would sit in the page.

```
Browser (React)  ->  /api  ->  Express  ->  Radarr / Sonarr / Overseerr / qBittorrent / Tautulli / Plex
                                   |
                                   +-> data/config.json, data/history.json
```

| Endpoint | Purpose |
|---|---|
| `GET /api/library` | Merged library with tags, size and watch data (`?refresh=1` skips the cache) |
| `POST /api/plan` | Preview what a delete would touch |
| `POST /api/delete` | Run the delete steps |
| `GET /api/history` | Deletion history |
| `GET/PUT /api/services`, `POST /api/services/test` | Manage and test connections |
| `GET /api/export`, `POST /api/import` | Export and import settings |

### Project layout

```
server/        Express API (lib.js has the service clients and the delete workflow)
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
- Optional authentication

## Credits and trademarks

Service logos shown in the Settings page belong to their respective owners (Radarr, Sonarr, Prowlarr, Overseerr, qBittorrent, Plex, Tautulli) and are used only to identify those services. This project is not affiliated with or endorsed by any of them.

## License

Add a `LICENSE` file before publishing. MIT is a common choice for a project like this.
