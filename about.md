# Reclaim — Product Brief

*This document describes the product for the purpose of generating landing
page copy/design. Every claim here is grounded in the actual, current
implementation — nothing below is aspirational or unverified.*

## What it is

Reclaim is a native macOS app that scans your disk, shows you exactly what's
using your space with an interactive visual map, and helps you safely clean
up gigabytes of files you don't need — large files, exact duplicates,
developer build artifacts, AI tool caches and model weights, and leftover
data from apps you've already uninstalled. Nothing is ever permanently
deleted outright — everything goes to the macOS Trash first.

**Platform:** macOS only, universal binary (runs natively on both Apple
Silicon and Intel Macs — one download, no picking the "right" version).

**Domain:** reclaimmac.store

## The problem it solves

Mac storage fills up silently and macOS gives you almost no way to see why:

- **Developers accumulate huge, invisible caches.** Every JavaScript project
  has its own multi-hundred-MB `node_modules`. Every Rust project has a
  `target/` folder that can hit double-digit gigabytes. Python virtualenvs,
  `__pycache__`, build outputs (`.next`, `.nuxt`), Gradle/CocoaPods caches —
  these pile up across dozens of old projects and are invisible in Finder.
- **AI tools are a newer, bigger version of the same problem.** Local model
  weights (Ollama, LM Studio, HuggingFace cache, Stable Diffusion/ComfyUI
  checkpoints) and IDE/agent caches (Cursor, GitHub Copilot, Claude,
  ChatGPT desktop, Windsurf, Continue, Sourcegraph Cody, Aider, and more) can
  quietly consume tens to hundreds of gigabytes with zero visibility.
- **Duplicate files accumulate from downloads, photo exports, and backups**
  and are effectively impossible to find manually.
- **Uninstalling an app on macOS doesn't remove its data.** Application
  Support and Caches folders for apps you deleted months ago just sit there
  forever.
- **Apple's own "About This Mac → Storage" is slow, vague, and read-only** —
  it tells you a rough category breakdown and nothing actionable.

## Who it's for

Primarily developers, power users, and AI/ML practitioners on macOS — people
whose disks fill up specifically *because* of dev tooling and AI model
caches, not just photos and videos (though it handles those too). Comfortable
enough to trust a tool that touches their filesystem, but wants real safety
guarantees, not a black box.

## How it works (what makes it fast and safe)

- **Native Rust engine, not Electron.** No bundled Chromium, no
  JavaScript-driven filesystem scanning. The scan engine is compiled Rust
  running through Tauri, with a webview for the UI only.
- **Parallel filesystem walking and hashing.** Directory scanning is
  parallelized across CPU cores; duplicate-file detection hashes candidates
  in parallel too (a cheap partial hash first, a full cryptographic hash only
  to confirm real matches).
- **Never loads the whole disk into memory at once.** The scan engine keeps
  a queryable index server-side and only ever sends the UI a bounded,
  on-demand slice of it — so it stays responsive scanning an entire startup
  disk with millions of files, not just a small folder.
- **Small footprint.** The whole universal (Intel + Apple Silicon) app is
  roughly 6.5MB — no runtime bloat.
- **Deletion is a Trash operation, never `rm`.** Files move to macOS Trash,
  recoverable like any normal delete. Core system paths (`/System`,
  `/Library`, `/Applications`, `/Users`, and others) are hardcoded as
  undeletable at the engine level — the UI cannot override this.
- **Full Disk Access, requested transparently.** Reclaim needs Full Disk
  Access to see inside `~/Documents`, `~/Desktop`, `~/Library`, etc. It asks
  for this with a guided, explained first-run prompt rather than failing
  silently.
- **Auto-updates.** Ships with a built-in updater — users always get the
  latest version without manually re-downloading.

## Features (what the product page should showcase)

1. **Space Overview** — an interactive, color-coded treemap of the entire
   scanned drive. Every rectangle is a file or folder sized proportionally to
   its disk usage; hover for details, right-click for actions, drag straight
   onto the trash cart to stage it for deletion.
2. **Disk Explorer** — a Finder-style breadcrumb browser for drilling into
   any folder, with instant sorting by size.
3. **Duplicate Finder** — finds exact-content duplicate files (verified by
   cryptographic hash, not just filename/size guessing), with a "smart
   select" that auto-picks all but the original copy of each duplicate set.
4. **Large Files** — every file over 100MB, sorted biggest first.
5. **AI Cache & Logs** — a category unique to this app: detects and groups
   cache/model data by AI tool (HuggingFace, Ollama, LM Studio, ComfyUI,
   Cursor, GitHub Copilot, Claude/Anthropic, ChatGPT/OpenAI, Codeium,
   Tabnine, Continue, Sourcegraph Cody, Windsurf, Aider, PyTorch, TensorFlow,
   Conda, Jupyter, and more) so users can see exactly which tool is eating
   their space.
6. **App Leftovers** — finds Application Support / Caches data belonging to
   apps that are no longer installed.
7. **Dev Cleanup** — finds and categorizes `node_modules`, Python
   virtualenvs/`__pycache__`, Rust `target/` directories, JS build outputs
   (`.next`/`.nuxt`), Gradle caches, CocoaPods `Pods/`, and more, grouped by
   category with one-click bulk selection per group.
8. **Global search (⌘K)** — instant search across the entire scanned
   filesystem.
9. **System Info** — CPU, RAM, and per-disk usage at a glance.
10. **Safety net throughout** — every delete action shows a confirmation
    modal with item count and total size before anything moves to Trash; a
    persistent "trash cart" lets users stage multiple deletions from
    different views before committing.

## Design / UI direction

Dark theme, glassmorphic cards (translucent, blurred backgrounds) over a
near-black backdrop with a red/crimson primary accent color. Rounded-2xl
cards, soft glowing shadows on primary actions, smooth enter/exit animations.
The overall feel is closer to a premium native macOS utility (think
CleanMyMac / DaisyDisk) than a generic SaaS dashboard — confident, dense with
real data (sizes, counts, percentages), not overly minimal.

## What NOT to claim yet

- No specific quantitative "X% faster than [competitor]" performance claims
  — none have been benchmarked against other tools.
- It is not currently Apple-notarized / signed with an Apple Developer ID —
  ships unsigned for now, so don't claim "notarized" or "identified
  developer" in copy. This is planned but not yet live; downloads currently
  require a one-time Gatekeeper bypass (right-click → Open).
- No pricing/licensing details are finalized yet — payment and licensing
  integration (Dodo Payments) is planned but not live. Don't invent a price.
- Logo/brand mark is not finalized — a placeholder or wordmark-only treatment
  should be used until final brand assets are supplied.
