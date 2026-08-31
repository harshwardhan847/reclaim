#!/usr/bin/env node
// Bumps the version in package.json, src-tauri/Cargo.toml, and
// src-tauri/tauri.conf.json together, commits, and creates the release tag.
// Usage: pnpm release 0.1.1
//
// Stops short of `git push` on purpose -- pushing the tag is what triggers
// the GitHub Actions release build, so that stays a deliberate manual step.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: root, encoding: "utf8", ...opts });
}

function fail(message) {
  console.error(`\nError: ${message}`);
  process.exit(1);
}

const version = process.argv[2];
if (!version) {
  fail("Usage: pnpm release <version>  (e.g. pnpm release 0.1.1)");
}
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail(`"${version}" doesn't look like a plain semver version (expected X.Y.Z, no leading "v").`);
}

const status = run("git status --porcelain").trim();
if (status.length > 0) {
  fail("Working tree isn't clean. Commit or stash your changes before cutting a release:\n" + status);
}

const tag = `v${version}`;
const existingTags = run("git tag -l").split("\n");
if (existingTags.includes(tag)) {
  fail(`Tag ${tag} already exists.`);
}

// --- package.json ---
const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// --- src-tauri/Cargo.toml ---
const cargoTomlPath = path.join(root, "src-tauri", "Cargo.toml");
let cargoToml = readFileSync(cargoTomlPath, "utf8");
const cargoVersionRe = /^version = "[^"]*"/m;
if (!cargoVersionRe.test(cargoToml)) {
  fail(`Couldn't find a "version = ..." line in ${cargoTomlPath}`);
}
cargoToml = cargoToml.replace(cargoVersionRe, `version = "${version}"`);
writeFileSync(cargoTomlPath, cargoToml);

// --- src-tauri/tauri.conf.json ---
const tauriConfPath = path.join(root, "src-tauri", "tauri.conf.json");
const tauriConf = JSON.parse(readFileSync(tauriConfPath, "utf8"));
tauriConf.version = version;
writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + "\n");

console.log(`Bumped version to ${version} in package.json, src-tauri/Cargo.toml, src-tauri/tauri.conf.json`);

// Refresh Cargo.lock's own record of the local package's version.
try {
  run("cargo check -q", { cwd: path.join(root, "src-tauri") });
} catch (err) {
  fail(`"cargo check" failed after bumping the version -- fix the build before releasing.\n${err.message}`);
}

run(
  `git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json`
);
run(`git commit -m "chore: bump version to ${version}"`);
run(`git tag ${tag}`);

console.log(`\nCommitted the version bump and created tag ${tag}.`);
console.log(`\nReview it, then push when ready:`);
console.log(`  git push && git push origin ${tag}`);
