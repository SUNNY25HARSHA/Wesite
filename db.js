/**
 * Tiny file-backed database.
 *
 * This stores everything as JSON on disk at data/db.json. It's a real,
 * persistent database in the sense that data survives restarts and is
 * shared across every device that talks to this server — it's just not
 * a SQL/NoSQL server process, which keeps setup to "npm install && npm start"
 * with nothing else to configure or install locally.
 *
 * If you outgrow this (many concurrent users, need real transactions),
 * swap this file for a Postgres/MySQL/SQLite client — every other file
 * only calls the functions exported here, so that's the one place to change.
 */

const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "data", "db.json");

function ensureDb() {
  if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: [], events: [] }, null, 2));
  }
}

function read() {
  ensureDb();
  const raw = fs.readFileSync(DB_PATH, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    // corrupt file safety net — start fresh rather than crash the server
    const fallback = { users: [], events: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(fallback, null, 2));
    return fallback;
  }
}

let writeQueue = Promise.resolve();
function write(data) {
  // serialize writes so rapid successive requests can't clobber each other
  writeQueue = writeQueue.then(
    () =>
      new Promise((resolve, reject) => {
        fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), (err) => {
          if (err) reject(err);
          else resolve();
        });
      })
  );
  return writeQueue;
}

module.exports = { read, write };
