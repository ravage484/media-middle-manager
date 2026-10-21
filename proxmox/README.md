# Proxmox VE helper script

Files for installing Media Middle Manager in its own LXC container, in the [community-scripts/ProxmoxVE](https://github.com/community-scripts/ProxmoxVE) format.

| File | Goes in the helper-scripts repo at |
|---|---|
| `ct/media-middle-manager.sh` | `ct/media-middle-manager.sh` (runs on the Proxmox host, creates the container, and handles updates) |
| `install/media-middle-manager-install.sh` | `install/media-middle-manager-install.sh` (runs inside the container) |
| `ct/headers/mediamiddlemanager` | `ct/headers/mediamiddlemanager` (the banner) |
| `frontend/public/json/media-middle-manager.json` | `frontend/public/json/media-middle-manager.json` (website metadata) |

## What it sets up

- Debian 13 unprivileged LXC: 1 vCPU, 1 GB RAM, 4 GB disk (the 1 GB is for the one-time build).
- Node.js 22, then `npm ci`, `npm run build` and `npm prune --omit=dev`.
- A systemd service, `media-middle-manager`, listening on port **3001**.
- Your settings and history in `/opt/media-middle-manager_data`, kept outside the app folder so updates never touch them.

## Before you use it

1. **Create a release.** The scripts download the latest *release* of `ravage484/media-middle-manager`, not the default branch. Tag one (for example `v0.1.0`) and publish it.
2. **The repository is private for now, and that blocks these scripts.** The installer downloads the release anonymously, which fails (404) on a private repo, and so does the `curl` one-liner below for a private fork. While testing, either make the repository public, or install by hand with the manual steps in the main README. A token-based download is possible but is not wired into these scripts.
3. Verify the category id (`13`) in the JSON against the helper-scripts `metadata.json`.

## Running it

The container script pulls the shared `build.func` and your install script from the helper-scripts repository, so the install script has to live in a repository that serves it from the expected path. For your own use, that means a **fork** of `community-scripts/ProxmoxVE` with the files above added. Then, on the Proxmox host shell:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/ravage484/ProxmoxVE/main/ct/media-middle-manager.sh)"
```

If your fork keeps the original `build.func` source line pointing at `community-scripts`, change the install-script download URL in your fork's `misc/build.func` to point at your fork as well.

## Updating

Run the same command again inside the container's shell, or run `update` in the container console. It stops the service, downloads the new release, rebuilds and restarts.

## Notes

- These scripts were syntax-checked and the install steps (`npm ci`, build, prune, start with the service's environment variables) were rehearsed on a clean copy, but they have **not** been run on a real Proxmox host.
- The first visit to the app asks you to create an account, and until you do, anyone who can reach port 3001 can claim it. To avoid that window, add `Environment=MMM_ADMIN_USER=...` and `Environment=MMM_ADMIN_PASSWORD=...` to the systemd unit before the first start (the install script does not set them).
- Stored API keys are encrypted. The key is generated on first start into `/opt/media-middle-manager_data/secret.key`; back that file up separately from the database, or set `Environment=MMM_SECRET_KEY=...` in the systemd unit to keep the key out of the data folder. Without it, the stored keys cannot be recovered.
- The database is SQLite through `better-sqlite3`, a native module. It ships prebuilt binaries for current Node versions on Debian, so the install needs no compiler. If an install ever fails building it, install `build-essential` and `python3` in the container and re-run `npm ci`.
- Forgot your password? In the container: `cd /opt/media-middle-manager && DATA_DIR=/opt/media-middle-manager_data npm run reset-password -- admin "new password"`.
