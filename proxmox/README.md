# Proxmox VE helper script

Files for installing Media Middle Manager in its own LXC container, written for the [community-scripts](https://github.com/community-scripts/ProxmoxVE) helper-script engine.

| File | Purpose |
|---|---|
| `ct/mediamiddlemanager.sh` | Runs on the Proxmox host: creates the container, and handles updates |
| `install/mediamiddlemanager-install.sh` | Runs inside the new container |
| `ct/headers/mediamiddlemanager` | The banner. Only needed if the app is ever submitted to the community-scripts repositories; this engine does not read it from here |

**The file names have no hyphens on purpose.** The engine derives them from the app name with the spaces removed (`Media Middle Manager` becomes `mediamiddlemanager`), and it looks for exactly `install/mediamiddlemanager-install.sh` and `ct/mediamiddlemanager.sh` (the latter for the `update` command). A hyphenated name makes the install fail with "Could not fetch install/mediamiddlemanager-install.sh".
| `frontend/public/json/media-middle-manager.json` | Website metadata, also only for a submission |

The engine lives in its own repository (`community-scripts/core`) and can load the `ct/` and `install/` scripts from any location via `COMMUNITY_SCRIPTS_URL`. That is how this project uses it, so **no fork of the community-scripts repository is needed**.

## What it sets up

- Debian 13 unprivileged LXC: 1 vCPU, 1 GB RAM, 4 GB disk (the 1 GB is for the one-time build).
- Node.js 22, then `npm ci`, `npm run build` and `npm prune --omit=dev`.
- A systemd service, `media-middle-manager`, listening on port **3001**.
- Your settings and history in `/opt/media-middle-manager_data`, kept outside the app folder so updates never touch them.

## Before you use it

1. **The repository must be public while you install.** Two things are fetched anonymously over the internet: the two scripts from `raw.githubusercontent.com`, and the release tarball inside the container. Both return 404 for a private repository. The engine can use a `GITHUB_TOKEN` for the release lookup, but I could not confirm the token is passed into the container or that it covers the tarball download, so do not rely on it. Make the repo public for the install (you can make it private again afterwards; updates need it public again), or use the manual install in the main README.
2. **Publish a release.** The installer downloads the latest *release*, not the default branch:

   ```bash
   gh release create v0.1.0 --repo ravage484/media-middle-manager --title "v0.1.0" --notes "First test release"
   ```
3. Push any script changes to `main` first, because the host script fetches the install script from `main`.

## Running it

On the Proxmox host shell:

```bash
COMMUNITY_SCRIPTS_URL="https://raw.githubusercontent.com/ravage484/media-middle-manager/main/proxmox" bash -c "$(curl -fsSL https://raw.githubusercontent.com/ravage484/media-middle-manager/main/proxmox/ct/mediamiddlemanager.sh)"
```

`COMMUNITY_SCRIPTS_URL` tells the engine where to find `ct/` and `install/`. The engine itself, and the shared `tools.func` (Node.js setup, release download), still come from `community-scripts/core`. Choose **Default** at the prompt for the settings in the table above, or **Advanced** to change CPU, RAM, disk, network and so on.

To change the container defaults without prompts, set the variables on the same line, for example `var_ram=2048 var_disk=8`.

### Running from a local checkout

If you would rather not pull the scripts over the internet, clone the repo on the Proxmox host and point the engine at the folder:

```bash
COMMUNITY_SCRIPTS_ROOT=/root/media-middle-manager/proxmox bash /root/media-middle-manager/proxmox/ct/mediamiddlemanager.sh
```

The engine prefers local files when they exist. The container still downloads the release from GitHub, so the repo must still be public for that step.

## Updating

Run the same command again, or `update` in the container console. It stops the service, downloads the new release, rebuilds and restarts. According to the engine's source, `update` is a small script written into the container at install time that already contains your `COMMUNITY_SCRIPTS_URL`, so it fetches `ct/mediamiddlemanager.sh` from your repo. If it ever does not, run the full command above instead.

## Notes

- These scripts were syntax-checked, written against the current engine (`community-scripts/core`) and compared with a current Node app's scripts, and the install steps (`npm ci`, build, prune, start with the service's environment variables) were rehearsed on a clean copy. They have **not** been run on a real Proxmox host, so expect to fix something on the first run. If it fails, the engine keeps the container so you can read the install log inside it.
- The first visit to the app asks you to create an account, and until you do, anyone who can reach port 3001 can claim it. To avoid that window, add `Environment=MMM_ADMIN_USER=...` and `Environment=MMM_ADMIN_PASSWORD=...` to the systemd unit before the first start (the install script does not set them).
- To bring an existing install's data into the container, download a **database backup** from the old install (Settings > Import / Export), then restore it in the container's app. In the restore form, give the old install's `secret.key` in the **Key of the backup** field. The keys are re-encrypted under the container's own key, so no key file has to be copied onto the container.
- Stored API keys are encrypted. The key is generated on first start into `/opt/media-middle-manager_data/secret.key`; back that file up separately from the database, or set `Environment=MMM_SECRET_KEY=...` in the systemd unit to keep the key out of the data folder. Without it, the stored keys cannot be recovered.
- The database is SQLite through `better-sqlite3`, a native module. It ships prebuilt binaries for current Node versions, and the install script also installs `build-essential` and `python3` so it can compile the module if no prebuilt one matches (for example on ARM).
- Forgot your password? In the container: `cd /opt/media-middle-manager && DATA_DIR=/opt/media-middle-manager_data npm run reset-password -- admin "new password"`.
