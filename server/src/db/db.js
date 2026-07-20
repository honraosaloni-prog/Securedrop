// Uses Node's built-in node:sqlite (requires Node >= 22.5). This avoids any
// native-module compilation step, which keeps deployment simple and
// dependency-free for the persistence layer.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbDir = path.dirname(config.dbPath);
if (dbDir && dbDir !== '.' && !fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const raw = new DatabaseSync(config.dbPath);
raw.exec('PRAGMA journal_mode = WAL;');
raw.exec('PRAGMA foreign_keys = ON;');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
raw.exec(schema);

// Thin better-sqlite3-compatible wrapper (.prepare().run/get/all + .exec)
// so the rest of the codebase reads the same regardless of driver.
function wrapStatement(stmt) {
  return {
    run: (...params) => stmt.run(...params),
    get: (...params) => stmt.get(...params),
    all: (...params) => stmt.all(...params),
  };
}

export const db = {
  prepare: (sql) => wrapStatement(raw.prepare(sql)),
  exec: (sql) => raw.exec(sql),
};

export function nowMs() {
  return Date.now();
}
