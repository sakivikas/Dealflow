import Database from "better-sqlite3";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "..", "dealflow.db");

const db = new Database(DB_PATH);

db.pragma("journal_mode = DELETE");

db.exec(`
  CREATE TABLE IF NOT EXISTS app_data (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    team_member_id TEXT NOT NULL,
    created_at    INTEGER DEFAULT (unixepoch())
  )
`);

const SEED_USERS = [
  { id: "auth_u1", email: "purchaser1@infinitee.in", teamId: "u1", password: "Infin@123" },
  { id: "auth_u2", email: "purchaser2@infinitee.in", teamId: "u2", password: "Infin@123" },
  { id: "auth_u3", email: "sales1@infinitee.in",     teamId: "u3", password: "Infin@123" },
  { id: "auth_u4", email: "sales2@infinitee.in",     teamId: "u4", password: "Infin@123" },
  { id: "auth_u5", email: "qc@infinitee.in",         teamId: "u5", password: "Infin@123" },
  { id: "auth_u6", email: "manager@infinitee.in",    teamId: "u6", password: "Infin@123" },
  { id: "auth_u7", email: "admin@infinitee.in",      teamId: "u7", password: "Admin@123" },
];

const userCount = db.prepare("SELECT COUNT(*) as c FROM users").get().c;
if (userCount === 0) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO users (id, email, password_hash, team_member_id) VALUES (?, ?, ?, ?)"
  );
  for (const u of SEED_USERS) {
    const hash = bcrypt.hashSync(u.password, 10);
    insert.run(u.id, u.email, hash, u.teamId);
  }
  console.log("Seeded", SEED_USERS.length, "default user accounts");
}

export function findUserByEmail(email) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email);
}

export function createUser(id, email, password, teamMemberId) {
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    "INSERT INTO users (id, email, password_hash, team_member_id) VALUES (?, ?, ?, ?)"
  ).run(id, email, hash, teamMemberId);
}

export function updatePassword(userId, newPassword) {
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, userId);
}

export function deleteUser(userId) {
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

export function listUsers() {
  return db.prepare("SELECT id, email, team_member_id, created_at FROM users").all();
}

export function load(key) {
  const row = db.prepare("SELECT value FROM app_data WHERE key = ?").get(key);
  return row ? JSON.parse(row.value) : null;
}

export function save(key, data) {
  const json = JSON.stringify(data);
  db.prepare(
    "INSERT INTO app_data (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, json);
}

export function wipe(key) {
  db.prepare("DELETE FROM app_data WHERE key = ?").run(key);
}

export function wipeUsers() {
  db.prepare("DELETE FROM users").run();
}

export default db;
