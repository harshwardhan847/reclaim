# Reclaim

A native macOS disk-space cleanup app. Scans your drive, visualizes what's using
space, and safely finds large files, exact duplicates, developer cruft
(`node_modules`, build outputs, Python/Rust caches), AI tool caches and model
weights, and leftover data from uninstalled apps — everything moves to the
Trash, never deleted outright.

## Tech stack

**Frontend** — React 19 + TypeScript, Vite, Tailwind CSS v4, `@base-ui/react`
primitives, `lucide-react` icons, `d3-hierarchy`/`d3-scale` (canvas-rendered
treemap), `recharts` (analytics charts).

**Backend** — Rust on Tauri v2. Key crates:
- `jwalk` — parallel filesystem walking
- `rayon` — parallel duplicate-file hashing
- `xxhash-rust` (xxh3) — fast content hashing for duplicate verification
- `sysinfo` — CPU/RAM/disk info
- `trash` — moves files to the system Trash (never permanent delete)
- `tauri-plugin-updater` / `tauri-plugin-process` — in-app auto-update

Release builds use full LTO, a single codegen unit, and `panic = "abort"`
(see `src-tauri/Cargo.toml`) for a small, fast binary — the universal DMG is
~6.5MB.

## Architecture

The disk scan is the performance-critical path, so it's designed around one
rule: **never ship the whole filesystem tree over IPC.**

- `scan_path` walks the target directory in parallel (`jwalk`), then caches
  the full result server-side in Rust (`ScanState`, a `Mutex<Option<ScanIndex>>`
  managed by Tauri). The frontend only ever receives a depth- and
  breadth-bounded summary tree (capped node count, regardless of how many
  files actually exist on disk) plus a couple of instant aggregate badges.
- Every other view (Large Files, AI Cache, App Leftovers, Duplicates, search,
  drilling into a folder past the summary tree's cutoff) is a separate command
  that queries the already-cached index in memory — no re-walking the disk,
  no re-flattening a multi-million-node tree in JavaScript.
- Duplicate detection: candidates are grouped by exact file size from the
  cached index, then hashed in parallel across all CPU cores (`rayon`) — a
  cheap 4KB prefix hash first, a full content hash only for real candidates.

Frontend state mirrors this: each "smart clean" tab lazily fetches its own
data the first time it's opened, rather than eagerly computing every category
on every scan.

## Project structure

```
src/                      React frontend
  components/              Views (TreemapViewer, DuplicateView, DevCleanupView, ...)
  lib/                      Shared hooks/utils (useAppUpdater, cn)
src-tauri/
  src/main.rs               All Tauri commands + scan engine
  capabilities/              Tauri v2 permission grants
  icons/                     App icons (regenerate via `pnpm tauri icon <path>`)
scripts/release.mjs         Version bump + tag helper (see below)
.github/workflows/release.yml   CI: builds, signs, and drafts a GitHub Release on every `v*` tag
```

## Development

```bash
pnpm install
pnpm tauri dev      # run the app with hot reload
```

Other scripts:
- `pnpm build` — typecheck + build the frontend (`tsc -b && vite build`)
- `pnpm lint` — oxlint
- `pnpm tauri build --target universal-apple-darwin` — build a local universal (Apple Silicon + Intel) release DMG

## Cutting a release

```bash
pnpm release 0.1.2   # bumps package.json, Cargo.toml, tauri.conf.json together, commits, tags
git push && git push origin v0.1.2
```

Pushing the tag triggers `.github/workflows/release.yml`, which builds a
universal binary, signs the auto-updater artifact, and creates a **draft**
GitHub Release with the DMG + `latest.json` manifest attached. Review it,
then publish manually — nothing is live for users (downloads or the in-app
updater) until you do.

Apple code signing/notarization is currently **disabled** in the workflow
(commented out) — the app ships unsigned for now. To re-enable: add the
`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
`APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` secrets in the repo settings,
uncomment the matching block in the workflow, and push a new tag.

## Permissions

Reclaim requests **Full Disk Access** (macOS System Settings → Privacy &
Security) to scan protected folders like `~/Documents`, `~/Desktop`, and
`~/Library`. Without it, scans silently skip those folders. The app has a
guided first-run prompt for this (`check_fda_status` / `FdaModal.tsx`).

Deletion is guarded at the Rust layer (`is_protected_path`) — `/System`,
`/Library`, `/Applications`, `/Users`, and other core macOS paths can never
be deleted through the app, regardless of what the UI allows selecting.
