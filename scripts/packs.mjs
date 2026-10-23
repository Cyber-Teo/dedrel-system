#!/usr/bin/env node
// Compendium packs: JSON sources in git, LevelDB databases built from them.
//
//   npm run save-packs    Foundry -> JSON: write the databases in packs/<name>/ out to
//                         packs/_source/<name>/, one file per document. Run after editing
//                         content in Foundry, then commit.
//   npm run build-packs   JSON -> Foundry: rebuild packs/<name>/ from packs/_source/<name>/.
//                         Run after the JSON changed (git pull, edits in files). Foundry
//                         must be stopped.
//   npm run packs-status  Show which side changed since the last sync. Changes nothing.
//
// Pass pack names to limit a command (`npm run save-packs -- talents maneuvers`);
// --force skips the safety check described below.
//
// SAFETY. Both directions overwrite the other side completely, so each sync records a
// fingerprint of the content in packs/.sync-state.json (not in git). Before overwriting,
// the target is compared with that fingerprint: if it changed since the last sync too,
// the command stops instead of silently throwing those changes away. Volatile _stats
// fields (timestamps, versions) are ignored, so opening and re-saving a document in
// Foundry without real edits does not count as a change.
import { extractPack, compilePack } from "@foundryvtt/foundryvtt-cli";
import { ClassicLevel } from "classic-level";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SYSTEM_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = path.join(SYSTEM_DIR, "packs", "_source");
const STATE_FILE = path.join(SYSTEM_DIR, "packs", ".sync-state.json");
const VOLATILE_FIELDS = ["createdTime", "modifiedTime", "lastModifiedBy", "systemVersion", "coreVersion"];
const EXTRACT_OPTIONS = { folders: true, clean: true, omitVolatile: true, jsonOptions: { space: 2 } };

/** Packs declared in system.json, as { name, db, src }. */
function listPacks() {
  const manifest = JSON.parse(fs.readFileSync(path.join(SYSTEM_DIR, "system.json"), "utf8"));
  return manifest.packs.map(p => ({
    name: p.name,
    // Legacy manifests point at "packs/<name>.db"; Foundry stores LevelDB in "packs/<name>/".
    db: path.join(SYSTEM_DIR, p.path.replace(/\.db$/, "")),
    src: path.join(SOURCE_DIR, p.name)
  }));
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return {}; }
}

function writeState(state) {
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

function listFiles(dir, base = dir) {
  if ( !fs.existsSync(dir) ) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    if ( e.isDirectory() ) return listFiles(full, base);
    return e.name.endsWith(".json") ? [path.relative(base, full)] : [];
  }).sort();
}

function stripVolatile(value) {
  if ( Array.isArray(value) ) return value.forEach(stripVolatile);
  if ( !value || (typeof value !== "object") ) return;
  if ( value._stats ) for ( const f of VOLATILE_FIELDS ) delete value._stats[f];
  Object.values(value).forEach(stripVolatile);
}

/** Fingerprint of a source tree: paths and contents, volatile fields ignored. Null if absent. */
function fingerprint(dir) {
  if ( !fs.existsSync(dir) ) return null;
  const hash = crypto.createHash("sha256");
  for ( const file of listFiles(dir) ) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    stripVolatile(doc);
    hash.update(`${file}\n${JSON.stringify(doc)}\n`);
  }
  return hash.digest("hex");
}

/**
 * Extract a database into a temporary source tree. The database is copied first: a running
 * Foundry keeps a LOCK on the packs it has open, and we never read the live files in place.
 * The current JSON sources are seeded into the target so that omitVolatile keeps their
 * timestamps for unchanged documents.
 */
async function extractToTemp(pack, tmp) {
  const out = path.join(tmp, "json", pack.name);
  if ( !fs.existsSync(pack.db) ) return null;
  const copy = path.join(tmp, "db", pack.name);
  fs.cpSync(pack.db, copy, { recursive: true });
  fs.rmSync(path.join(copy, "LOCK"), { force: true });
  if ( fs.existsSync(pack.src) ) fs.cpSync(pack.src, out, { recursive: true });
  await extractPack(copy, out, EXTRACT_OPTIONS);
  return out;
}

/** True if a running Foundry holds this database open. */
async function isLocked(pack) {
  if ( !fs.existsSync(pack.db) ) return false;
  const db = new ClassicLevel(pack.db, { createIfMissing: false });
  try {
    await db.open();
    await db.close();
    return false;
  } catch ( err ) {
    if ( err.cause?.code === "LEVEL_LOCKED" ) return true;
    throw err;
  }
}

/** Compare both sides of a pack with the fingerprint of the last sync. */
async function inspect(pack, state, tmp) {
  const extracted = await extractToTemp(pack, tmp);
  const db = extracted ? fingerprint(extracted) : null;
  const src = fingerprint(pack.src);
  const last = state[pack.name] ?? null;
  return {
    extracted, db, src,
    inSync: db === src,
    dbChanged: (db !== src) && (db !== last),
    srcChanged: (db !== src) && (src !== last)
  };
}

function describe(info) {
  if ( info.inSync ) return "in sync";
  if ( info.db === null ) return "no database yet -> build-packs";
  if ( info.src === null ) return "no JSON yet -> save-packs";
  if ( info.dbChanged && info.srcChanged ) return "CHANGED ON BOTH SIDES - resolve by hand";
  if ( info.dbChanged ) return "edited in Foundry -> save-packs";
  return "JSON changed -> build-packs";
}

function assertNoConflict(pack, info, force) {
  if ( info.dbChanged && info.srcChanged && (info.db !== null) && (info.src !== null) && !force ) {
    throw new Error(`${pack.name}: changed both in Foundry and in the JSON since the last sync. `
      + "Compare them with packs-status and git diff, then pass --force to the command whose side should win.");
  }
}

async function save(pack, info, state, force) {
  if ( info.inSync ) return "in sync";
  assertNoConflict(pack, info, force);
  if ( info.db === null ) return "no database, skipped";
  if ( info.srcChanged && (info.src !== null) && !force ) {
    throw new Error(`${pack.name}: the JSON changed since the last sync; saving would discard it. `
      + "Run build-packs first, or pass --force to overwrite the JSON.");
  }
  fs.rmSync(pack.src, { recursive: true, force: true });
  fs.cpSync(info.extracted, pack.src, { recursive: true });
  if ( !listFiles(pack.src).length ) fs.writeFileSync(path.join(pack.src, ".gitkeep"), "");
  state[pack.name] = fingerprint(pack.src);
  return `saved ${listFiles(pack.src).length} files`;
}

async function build(pack, info, state, force) {
  if ( info.inSync ) return "in sync";
  assertNoConflict(pack, info, force);
  if ( info.src === null ) return "no JSON, skipped";
  if ( info.dbChanged && (info.db !== null) && !force ) {
    throw new Error(`${pack.name}: the database was edited in Foundry since the last sync; building would `
      + "discard those edits. Run save-packs first, or pass --force to overwrite the database.");
  }
  await compilePack(pack.src, pack.db, { recursive: true });
  state[pack.name] = info.src;
  return "built";
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const force = args.includes("--force");
  const names = args.filter(a => !a.startsWith("--"));
  const packs = listPacks().filter(p => !names.length || names.includes(p.name));
  const unknown = names.filter(n => !packs.some(p => p.name === n));
  if ( !["save", "build", "status"].includes(command) || unknown.length ) {
    if ( unknown.length ) console.error(`Unknown pack(s): ${unknown.join(", ")}`);
    console.error("Usage: node scripts/packs.mjs save|build|status [pack...] [--force]");
    process.exit(2);
  }

  if ( command === "build" ) {
    const locked = [];
    for ( const pack of packs ) if ( await isLocked(pack) ) locked.push(pack.name);
    if ( locked.length ) {
      console.error(`Foundry is using these packs: ${locked.join(", ")}. Stop Foundry and run again.`);
      process.exit(1);
    }
  }

  const state = readState();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dedrel-packs-"));
  let failed = false;
  try {
    for ( const pack of packs ) {
      const info = await inspect(pack, state, tmp);
      let result;
      if ( info.inSync && (command !== "status") ) state[pack.name] = info.src;
      try {
        if ( command === "status" ) result = describe(info);
        else result = await (command === "save" ? save : build)(pack, info, state, force);
      } catch ( err ) {
        failed = true;
        result = `STOPPED: ${err.message}`;
      }
      // Written per pack, so an interrupted run never leaves finished packs unrecorded.
      if ( command !== "status" ) writeState(state);
      console.log(`${pack.name.padEnd(24)} ${result}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if ( failed ) process.exit(1);
}

await main();
