# Build Spec: Mac Disk Cleaner & Visualizer App

Use this document as the full instruction set to generate the application. Everything needed — stack, architecture, feature scope, data models, safety rules, and UI requirements — is included below.

---

## 1. Project Overview

Build a macOS desktop application that:
1. Scans the disk (full disk, a volume, or a chosen folder) and visualizes usage as a **treemap** of nested rectangles (folder → subfolder → file, sized by disk usage)
2. Lets users search, filter, and identify large/duplicate/junk files
3. Lets users safely delete files (Trash by default)
4. Includes a differentiated feature: detecting and cleaning local cache/history data from AI dev tools (Claude Code, Codex CLI, Cursor, etc.)
5. Is free to scan/view, and requires a one-time paid license ($19.99) to unlock deletion and premium cleanup features
6. Uses **Dodo Payments** for the one-time purchase and license-key management

---

## 2. Tech Stack (required)

- **Framework:** Tauri (Rust core + native WebView, NOT Electron)
- **Frontend:** React + TypeScript (or Svelte + TypeScript — pick one and stay consistent)
- **Treemap rendering:** Canvas2D, using `d3-hierarchy`'s `treemap` layout algorithm for the layout math only (draw manually on canvas, do not render as SVG/DOM nodes — performance matters at thousands of rectangles)
- **Rust core responsibilities:** filesystem traversal, size aggregation, trash/delete operations, duplicate detection (hashing), license validation calls, local data persistence
- **Local persistence:** SQLite (via `rusqlite`) or flat JSON files — store exclusion list and license cache metadata. (Do NOT cache the scan results for reloading after opening; always perform a fresh scan).
- **Secure license storage:** macOS Keychain (via `security-framework` crate), not a plain file
- **Auto-updates:** Tauri's built-in updater plugin
- **Distribution:** Signed with a Developer ID certificate, notarized by Apple, shipped as a `.dmg`. NOT distributed via the Mac App Store (incompatible with non-Apple IAP for a one-time purchase).

---

## 3. Rust Core — Commands to Implement

```rust
// Filesystem scanning
scan_path(path: String) -> ScanTree
  // Parallel directory walk (use `jwalk` crate for parallelism)
  // Returns a tree: { path, name, size_on_disk, logical_size, kind, children[] }
  // MUST correctly handle APFS clone files and hard links so size_on_disk
  // is not double-counted across sibling/cousin nodes
  // Emit progress events (current path, running total) to the frontend via
  // Tauri's event system so the UI can show live scan progress

// Duplicate detection
find_duplicates(tree: ScanTree) -> Vec<DuplicateGroup>
  // Group files by size first (cheap), then hash only same-size candidates
  // (use a fast non-cryptographic hash like xxhash for the candidate pass,
  // full hash only to confirm before ever suggesting deletion)

// AI tool cache detection
detect_ai_tool_caches(manifest: ToolManifest) -> Vec<ToolCacheEntry>
  // manifest is fetched from a remote JSON URL (your own CDN), NOT hardcoded,
  // so tool storage paths can be updated without an app release.
  // Bundle a local fallback copy of the manifest in case the fetch fails.
  // Manifest shape: [{ tool_name, paths: [...], per_session_glob_pattern }]
  // Return per-tool: total size, session count, oldest/newest timestamps

// Deletion
move_to_trash(paths: Vec<String>) -> Result<DeleteReport>
  // Use the `trash` crate — must be recoverable, never raw unlink by default
delete_permanent(paths: Vec<String>) -> Result<DeleteReport>
  // Separate, explicitly-invoked command. Requires a confirmed=true flag
  // passed from the frontend after an explicit user confirmation dialog.

// Safety
is_protected_path(path: String) -> bool
  // Hard-coded deny list checked before ANY delete operation, e.g.:
  // /System, /Library/Extensions, active app bundles (.app currently running),
  // the user's home directory root itself, any path outside the user's
  // scanned/selected scope. This check must run server-side (Rust), not
  // only in the UI, so it can't be bypassed.

// Licensing
activate_license(key: String, machine_id: String) -> Result<LicenseState>
  // Calls Dodo Payments' public activation endpoint
validate_license(cached_key: String) -> Result<LicenseState>
  // Periodic silent re-check (every 3–7 days), never blocks app launch
get_machine_id() -> String
  // Derive from hardware UUID (IOPlatformUUID) for stable per-Mac identity

// App Uninstaller & Leftovers
uninstall_app(app_path: String) -> Result<DeleteReport>
  // Finds and removes an application and all its associated files (~/Library/Containers, Caches, Preferences, etc.)
find_orphaned_leftovers() -> Vec<OrphanedLeftover>
  // Detects and lists orphaned Application Support files, Caches, and Preferences from previously deleted apps
```

---

## 4. Feature Scope

### 4.1 Free tier (all scanning/visibility features, no deletion)
- Scan: full disk, specific volume, or chosen folder — user picks at scan start
- Treemap canvas view (primary) + sortable list/table view (toggle between them). The canvas view should take up the full screen area, with stats displayed in a sidebar.
- Click a rectangle → breadcrumb path, size, item count, last modified date
- Drill-down navigation (double-click into folder, breadcrumb to go back up)
- Color-code rectangles by category: Apps, Documents, Media, System, Caches, Dev artifacts, AI tool data, Other
- Search by filename across the scanned tree
- Filters: file type/extension, size range, date created/modified
- Smart views: "Largest 100 files," "Largest folders," "Not opened in 6+ months," "Empty folders"
- Duplicate finder — shows groups and total reclaimable space, but delete action is locked behind paywall
- Live scan progress (current path + running total size, not just a spinner)

### 4.2 Paid tier (unlocked via license key)
- Delete to Trash from treemap or list view, single or batch select
- Permanent delete as a separate, explicitly confirmed action (never the default)
- Session-level undo for the last delete batch
- Exclusion list — user can mark paths "never suggest for deletion," persisted across scans
- Duplicate cleanup with "keep newest/oldest" auto-select + manual override
- **Dedicated App Uninstaller:** Cleanly remove applications along with their associated files, caches, and preferences.
- **Orphaned Leftovers Cleanup:** Detect and remove orphaned `Application Support` and preference files from apps deleted years ago.
- System junk categories: app caches/logs, old iOS backups, Xcode DerivedData/simulators, Docker images/volumes, package manager caches (npm/pip/cargo/Homebrew/yarn/pnpm), stale `node_modules`/`.build`/`target`/`dist` folders
- **AI tool cache cleanup module** (flagship feature): per-tool breakdown (Claude Code, Codex CLI, Cursor, OpenRouter-based tools, ChatGPT desktop, etc.), selective purge by age or manual session selection
- Scheduled/background weekly scans with notifications if a folder grew unusually or free space dropped below a threshold

### 4.3 Stats sidebar dashboard (free baseline, deepens with paid)
- Storage overview: used/free/total per volume as a ring or bar chart, visible in the sidebar
- Category breakdown: donut or bar chart across the categories listed above
- Top 10 largest folders, top 10 largest files

---

## 5. Trust & Safety Requirements (build these into v1, not later)
- Every delete defaults to Trash (recoverable); permanent delete is a separate, clearly labeled, explicitly confirmed action
- Hard-coded protected-path deny list enforced in Rust, checked before every delete call, cannot be bypassed from the frontend
- Correct APFS clone/hard-link handling so displayed sizes are accurate, not inflated
- Confirmation dialog summarizing exactly what will be deleted for any batch over a size threshold (e.g. >1GB)
- Warnings before surfacing anything from Mail/Messages/Photos data as deletable
- First-run explanation of Full Disk Access with a direct System Settings deep link, and clear detection/messaging if permission is missing or revoked later

---

## 6. Licensing Integration (Dodo Payments)

- Dodo product configured as a one-time purchase with the "License Keys" entitlement enabled, activation limit set (e.g. 2–3 devices per key)
- On purchase, Dodo auto-generates and emails the key — no custom fulfillment logic needed
- App flow: user pastes key → `activate_license(key, machine_id)` calls Dodo's public activate endpoint (no secret API key required, safe to call from the client) → on success, cache a signed/validated state in macOS Keychain → unlock paid UI
- Background re-validation every 3–7 days via `validate_license`; never block app launch on this; require a couple of consecutive failures (not just one) before locking features, to tolerate flaky networks
- "Restore purchase" screen: re-enter license key on a new Mac, same activate call; if activation limit is hit, show a link to Dodo's customer portal for device management/deactivation
- Store: license key, last validated timestamp, and validation result in Keychain — not a plain JSON file

---

## 7. UI/UX Requirements
- Native macOS look and feel via the WebView (respect system light/dark mode, no non-native chrome)
- Onboarding: 3–4 screens covering Full Disk Access request/explanation → first scan → treemap vs list view tour
- Empty states designed properly for: first scan not yet run, no duplicates found, "all caught up" after cleanup
- Menu bar quick-access item showing current free space, with one click into a fresh scan (build this even in v1 if time allows — strong retention driver)
- In-app license activation screen with "Restore purchase" option
- Settings screen: exclusion list management, scan schedule (paid), notification preferences, license/account info

---

## 8. Data Persistence (local, no backend required beyond license validation + manifest fetch)
- Exclusion list: SQLite or JSON
- License cache: macOS Keychain only
- AI tool cache manifest: fetched remotely with a bundled local fallback copy shipped in the app

---

## 9. Launch Checklist (non-code)
- Apple Developer account, Developer ID signing + notarization pipeline for the `.dmg`
- Dodo Payments product configured: one-time price, License Keys entitlement, activation limit
- Privacy policy covering the disk-scanning behavior
- Landing page leading with treemap screenshots and the AI-tool-cache-cleanup differentiator
- FAQ addressing "is this safe" and "why does it need Full Disk Access"
- Changelog page for the auto-updater to reference

---

## 10. Priority Order for Initial Build
1. Rust scan engine + basic treemap rendering (prove the core loop works end-to-end first)
2. List view + search/filters
3. Full Disk Access onboarding flow
4. Trash deletion + protected-path safety layer + exclusion list
5. License activation/validation flow (Dodo integration)
6. Stats dashboard (overview + category breakdown + top consumers)
7. AI tool cache detection module
8. System junk categories
9. Duplicate finder + cleanup actions
10. Auto-updater, menu bar item, scheduled scans (final polish pass)
