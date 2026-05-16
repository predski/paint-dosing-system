const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const dbDir = path.join(__dirname, "..", "database");
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const dbPath = path.join(dbDir, "pfa_dosing.db");
const db = new sqlite3.Database(dbPath);

function initDatabase() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS dosages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      mode TEXT NOT NULL,
      color_name TEXT NOT NULL,
      blue_ml REAL NOT NULL,
      red_ml REAL NOT NULL,
      yellow_ml REAL NOT NULL,
      green_ml REAL NOT NULL,
      total_ml REAL NOT NULL,
      status TEXT NOT NULL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      type TEXT NOT NULL,
      details TEXT NOT NULL,
      severity TEXT NOT NULL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS reservoirs (
      color_key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      volume_ml REAL NOT NULL,
      max_volume_ml REAL NOT NULL,
      low_level INTEGER NOT NULL DEFAULT 0
    )`);
    [
      ["blue", "Bleu", 1600, 2000, 0],
      ["red", "Rouge", 1600, 2000, 0],
      ["yellow", "Jaune", 1600, 2000, 0],
      ["green", "Vert", 1600, 2000, 0]
    ].forEach((r) => {
      db.run(`INSERT OR IGNORE INTO reservoirs (color_key, label, volume_ml, max_volume_ml, low_level) VALUES (?, ?, ?, ?, ?)`, r);
    });
  });
}
function run(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (err) {
    if (err) reject(err); else resolve({ id: this.lastID, changes: this.changes });
  }));
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
}
module.exports = { initDatabase, run, all, get };
