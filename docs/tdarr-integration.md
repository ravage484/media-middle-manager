# Tdarr integration: design

## Goal

Manage, from Media Middle Manager, the processing a title goes through (audio/video conversion, subtitle handling, and so on) before it is available in Plex, without opening Tdarr for every change.

## What Tdarr gives us

- **Libraries**: folders Tdarr watches. Each has a `flowId` (a Flow) or a list of classic plugins.
- **Flows**: node graphs that define the processing (e.g. "transcode to HEVC, keep English + original audio, extract subs").
- **Nodes**: workers that do the processing; can be paused.
- **Queues / staged files**: transcode queue and health-check queue, with per-file status (queued, processing, success, error).
- API on the server port (default **8265**). An API key is optional in Tdarr and is sent as `x-api-key`. Settings live in database collections read through `POST /api/v2/cruddb` (`LibrarySettingsJSONDB`, `FlowsJSONDB`); there are also `/api/v2/status` and `/api/v2/get-nodes`.

> The endpoint names and payload shapes above come from Tdarr's public API as documented; **verify them against a live instance** before building phases 2 and 3 (`server/tdarr.js` is the one place to adjust).

## How it fits the app

Tdarr is a normal service type (like Radarr or Plex): added in Settings > Services, stored and encrypted by the existing service store, included in export/import, tested with the same "Test" button. No schema change, since the optional API key uses the existing `apiKey` column.

The key mapping problem is **library to Arr root folder**. Radarr/Sonarr instances already know each title's root folder (`instances[].root` in the library data). A Tdarr library has a `folder`. Matching on path prefix tells us which Tdarr library (and therefore which flow) a title falls under. Paths may differ between containers, so the mapping is a small user-editable table (Arr root path <-> Tdarr library) with prefix-match auto-suggestion.

```
Radarr root /media/movies  --prefix match-->  Tdarr library "Movies"  --flowId-->  Flow "HEVC + EAC3 + subs"
```

## Phases

1. **Service + connection test** (done in this branch). `server/tdarr.js` read-only client: status, libraries, flows, nodes. The test reports version, library count and flow count.
2. **Read-only visibility**
   - `GET /api/tdarr/overview`: libraries with their assigned flow, nodes (paused/active), queue counts.
   - Title window: a "Processing" row showing the library and flow the title falls under, and its Tdarr file status (queued / processing / done / error) when known.
   - Library page filter: "Transcode errors" / "Waiting in Tdarr".
3. **Manage flows per library**
   - A Tdarr page: libraries with a dropdown to assign a flow (`cruddb` update on the library), with a confirm step because this changes what happens to every file in that library.
   - Pause/resume nodes; requeue or re-scan a failed file.
   - Flows themselves remain edited in Tdarr (its visual flow editor is not worth duplicating); we list them with a link out.
4. **Gate Plex availability** (the original aim)
   - Land new downloads in a staging library that Tdarr processes, and have Radarr/Sonarr import from its output, or trigger the Plex scan only once Tdarr reports the file done. Two options to decide on:
     - *Tdarr output to the Arr root* (simplest, Tdarr-native; app only observes).
     - *App-driven*: Plex library rescan fired from the app when Tdarr finishes (reuses `plexAct` and the Plex webhook/cache code).
   - Per-content-type presets ("anime: keep Japanese audio + subs", "4K: leave untouched") as named flow assignments.

## Safety rules (match the rest of the app)

- Everything before phase 3 is read-only.
- Writes go through `cleanX` validators on the server, take ids not free text, and require an explicit confirm in the UI.
- The same-origin redirect guard in `safeFetch` applies, so the API key is never sent elsewhere.
- Errors from Tdarr surface per section, never failing the whole page (same pattern as `getLibrary`'s `errors`).

## Decisions

- Flows only; classic plugin stacks are out of scope.
- Phase 4 will use the **app-driven** option (Plex scan fired when Tdarr reports done), not a staging folder, since that fits the existing Tdarr setup.
- For now the integration stays at phase 1: connection test only.

## Open questions

- Do your Arr and Tdarr containers see the same paths? If not, we need the mapping table in phase 2 rather than a prefix match.
