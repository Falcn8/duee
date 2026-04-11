import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import express from "express";
import morgan from "morgan";
import mysql from "mysql2/promise";
import { Resend } from "resend";

const APP_PORT = Number.parseInt(process.env.APP_PORT ?? "8000", 10);
const DB_HOST = process.env.DB_HOST ?? "127.0.0.1";
const DB_PORT = Number.parseInt(process.env.DB_PORT ?? "3306", 10);
const DB_USER = process.env.DB_USER ?? "";
const DB_PASSWORD = process.env.DB_PASSWORD ?? "";
const DB_NAME = process.env.DB_NAME ?? "duee";
const DB_CONNECTION_LIMIT = Number.parseInt(process.env.DB_CONNECTION_LIMIT ?? "10", 10);
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const DEBUG_LOCAL_STORAGE = process.env.DEBUG_LOCAL_STORAGE === "1";
const SESSION_SECRET = process.env.SESSION_SECRET ?? "";
const SESSION_TTL_DAYS = Number.parseInt(process.env.SESSION_TTL_DAYS ?? "30", 10);
const SESSION_TOUCH_INTERVAL_SECONDS = Number.parseInt(process.env.SESSION_TOUCH_INTERVAL_SECONDS ?? "300", 10);
const COOKIE_SECURE = parseEnvBoolean(process.env.COOKIE_SECURE, TRUST_PROXY);
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "";
const RESEND_WELCOME_EMAILS = parseEnvBoolean(process.env.RESEND_WELCOME_EMAILS, true);

const MAX_TASK_TEXT_LENGTH = 240;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const MAX_EMAIL_LENGTH = 320;
const MAX_DISPLAY_NAME_LENGTH = 48;
const ISO_DAY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_COOKIE_NAME = "duee_session";
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

if (!DEBUG_LOCAL_STORAGE && !DB_USER) {
  throw new Error("Missing DB_USER environment variable.");
}

if (!DEBUG_LOCAL_STORAGE && !/^[A-Za-z0-9_]+$/.test(DB_NAME)) {
  throw new Error("DB_NAME can only contain letters, numbers, and underscores.");
}

if (!DEBUG_LOCAL_STORAGE && !SESSION_SECRET) {
  throw new Error("Missing SESSION_SECRET environment variable.");
}

if (!Number.isFinite(SESSION_TTL_DAYS) || SESSION_TTL_DAYS < 1 || SESSION_TTL_DAYS > 365) {
  throw new Error("SESSION_TTL_DAYS must be between 1 and 365.");
}

if (
  !Number.isFinite(SESSION_TOUCH_INTERVAL_SECONDS)
  || SESSION_TOUCH_INTERVAL_SECONDS < 10
  || SESSION_TOUCH_INTERVAL_SECONDS > 86400
) {
  throw new Error("SESSION_TOUCH_INTERVAL_SECONDS must be between 10 and 86400.");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scryptAsync = promisify(crypto.scrypt);
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const app = express();
app.disable("x-powered-by");
if (TRUST_PROXY) {
  app.set("trust proxy", 1);
}

app.use(morgan("tiny"));
app.use(express.json({ limit: "1mb" }));
app.use(attachAuthSession);

let pool;

app.get("/api/config", (_req, res) => {
  res.json({
    mode: DEBUG_LOCAL_STORAGE ? "local-storage" : "database",
    debugLocalStorage: DEBUG_LOCAL_STORAGE,
    authRequired: !DEBUG_LOCAL_STORAGE,
  });
});

app.get("/api/health", async (_req, res, next) => {
  if (DEBUG_LOCAL_STORAGE) {
    res.json({ ok: true, mode: "local-storage" });
    return;
  }

  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, mode: "database" });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/session", (_req, res) => {
  if (DEBUG_LOCAL_STORAGE) {
    res.json({ authenticated: false, user: null, debugLocalStorage: true });
    return;
  }

  if (!_req.authUser) {
    res.json({ authenticated: false, user: null });
    return;
  }

  res.json({
    authenticated: true,
    user: toApiUser(_req.authUser),
  });
});

app.post("/api/auth/register", requireDatabaseMode, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const displayName = normalizeDisplayName(req.body?.displayName, email);
    const password = normalizePassword(req.body?.password);
    const passwordHash = await hashPassword(password);
    const userId = crypto.randomUUID();

    const firstUser = await isUsersTableEmpty();

    await pool.query(
      `
      INSERT INTO users (id, email, display_name, password_hash)
      VALUES (?, ?, ?, ?)
      `,
      [userId, email, displayName, passwordHash]
    );

    if (firstUser) {
      await pool.query("UPDATE tasks SET user_id = ? WHERE user_id IS NULL", [userId]);
    }

    await createSessionForUser(userId, res);
    const user = await getUserById(userId);

    if (RESEND_WELCOME_EMAILS) {
      sendWelcomeEmail({
        toEmail: email,
        displayName,
      }).catch((sendError) => {
        console.error("Failed to send welcome email:", sendError);
      });
    }

    res.status(201).json({
      user: user ? toApiUser(user) : {
        id: userId,
        email,
        displayName,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error?.code === "ER_DUP_ENTRY") {
      next(conflict("An account with that email already exists."));
      return;
    }
    next(error);
  }
});

app.post("/api/auth/login", requireDatabaseMode, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = normalizePassword(req.body?.password);

    const [rows] = await pool.query(
      `
      SELECT id, email, display_name, password_hash, created_at
      FROM users
      WHERE email = ?
      LIMIT 1
      `,
      [email]
    );

    if (rows.length === 0 || !(await verifyPassword(password, rows[0].password_hash))) {
      throw unauthorized("Invalid email or password.");
    }

    const user = rows[0];
    await createSessionForUser(user.id, res);

    res.json({
      user: toApiUser(fromDbUserRow(user)),
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/auth/profile", requireDatabaseMode, requireAuth, async (req, res, next) => {
  try {
    const displayName = normalizeDisplayName(req.body?.displayName, req.authUser.email);

    await pool.query(
      `
      UPDATE users
      SET display_name = ?
      WHERE id = ?
      `,
      [displayName, req.authUser.id]
    );

    req.authUser.displayName = displayName;

    res.json({
      user: toApiUser(req.authUser),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", async (req, res, next) => {
  if (DEBUG_LOCAL_STORAGE) {
    res.json({ ok: true, mode: "local-storage" });
    return;
  }

  try {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE_NAME);
    if (token) {
      const tokenHash = hashSessionToken(token);
      await pool.query("DELETE FROM sessions WHERE token_hash = ?", [tokenHash]);
    }
    clearAuthCookie(res);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/tasks", requireDatabaseMode, requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT id, text, has_due_date, due_date, is_completed, created_at, completed_at
      FROM tasks
      WHERE user_id = ?
      ORDER BY is_completed ASC, has_due_date DESC, due_date ASC, created_at ASC
      `,
      [req.authUser.id]
    );

    res.json({ tasks: rows.map(toApiTask) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/tasks", requireDatabaseMode, requireAuth, async (req, res, next) => {
  try {
    const text = normalizeTaskText(req.body?.text);
    const hasDueDate = req.body?.hasDueDate !== undefined ? Boolean(req.body.hasDueDate) : true;
    const dueDate = hasDueDate ? normalizeDueDate(req.body?.dueDate) : null;

    const id = crypto.randomUUID();

    await pool.query(
      `
      INSERT INTO tasks (id, user_id, text, has_due_date, due_date, is_completed, completed_at)
      VALUES (?, ?, ?, ?, ?, 0, NULL)
      `,
      [id, req.authUser.id, text, hasDueDate ? 1 : 0, dueDate]
    );

    const createdTask = await getTaskById(id, req.authUser.id);
    res.status(201).json({ task: createdTask });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/tasks/:id", requireDatabaseMode, requireAuth, async (req, res, next) => {
  try {
    const taskId = req.params.id;
    const existing = await getTaskById(taskId, req.authUser.id, true);
    if (!existing) {
      res.status(404).json({ error: "Task not found." });
      return;
    }

    const nextText = req.body?.text !== undefined
      ? normalizeTaskText(req.body.text)
      : existing.text;

    const nextHasDueDate = req.body?.hasDueDate !== undefined
      ? Boolean(req.body.hasDueDate)
      : Boolean(existing.has_due_date);

    let nextDueDate = null;
    if (nextHasDueDate) {
      const requestedDueDate = req.body?.dueDate !== undefined ? req.body.dueDate : existing.due_date;
      nextDueDate = normalizeDueDate(requestedDueDate);
    }

    const requestedCompletion = req.body?.isCompleted;
    const nextCompleted = requestedCompletion !== undefined
      ? Boolean(requestedCompletion)
      : Boolean(existing.is_completed);

    let nextCompletedAt = existing.completed_at;
    if (requestedCompletion !== undefined) {
      if (nextCompleted) {
        nextCompletedAt = existing.completed_at ?? new Date();
      } else {
        nextCompletedAt = null;
      }
    }

    await pool.query(
      `
      UPDATE tasks
      SET text = ?, has_due_date = ?, due_date = ?, is_completed = ?, completed_at = ?
      WHERE id = ? AND user_id = ?
      `,
      [
        nextText,
        nextHasDueDate ? 1 : 0,
        nextDueDate,
        nextCompleted ? 1 : 0,
        nextCompletedAt,
        taskId,
        req.authUser.id,
      ]
    );

    const updatedTask = await getTaskById(taskId, req.authUser.id);
    res.json({ task: updatedTask });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/tasks/:id", requireDatabaseMode, requireAuth, async (req, res, next) => {
  try {
    const [result] = await pool.query(
      "DELETE FROM tasks WHERE id = ? AND user_id = ?",
      [req.params.id, req.authUser.id]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: "Task not found." });
      return;
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use(express.static(__dirname));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    next();
    return;
  }
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use((error, _req, res, _next) => {
  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  const message = statusCode >= 500
    ? "Internal server error."
    : error.message;

  if (statusCode >= 500) {
    console.error(error);
  }

  res.status(statusCode).json({ error: message });
});

async function main() {
  if (!DEBUG_LOCAL_STORAGE) {
    await initializeDatabase();
    await ensureSchema();
  } else {
    console.warn("Running in DEBUG_LOCAL_STORAGE mode. MySQL routes are disabled.");
  }

  if (RESEND_WELCOME_EMAILS && (!resend || !RESEND_FROM_EMAIL)) {
    console.warn(
      "Resend welcome emails are enabled but not fully configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL."
    );
  }

  const server = app.listen(APP_PORT, () => {
    console.log(`duee web listening on :${APP_PORT}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      try {
        if (pool) {
          await pool.end();
        }
      } finally {
        process.exit(0);
      }
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

async function attachAuthSession(req, res, next) {
  if (!req.path.startsWith("/api/")) {
    next();
    return;
  }

  if (DEBUG_LOCAL_STORAGE) {
    req.authUser = null;
    req.authSessionId = null;
    next();
    return;
  }

  try {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE_NAME);
    if (!token) {
      req.authUser = null;
      req.authSessionId = null;
      next();
      return;
    }

    const tokenHash = hashSessionToken(token);
    const [rows] = await pool.query(
      `
      SELECT s.id AS session_id, s.user_id, u.email, u.display_name, u.created_at
      FROM sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
        AND s.expires_at > CURRENT_TIMESTAMP(3)
      LIMIT 1
      `,
      [tokenHash]
    );

    if (rows.length === 0) {
      req.authUser = null;
      req.authSessionId = null;
      clearAuthCookie(res);
      next();
      return;
    }

    req.authUser = fromDbUserRow({
      id: rows[0].user_id,
      email: rows[0].email,
      display_name: rows[0].display_name,
      created_at: rows[0].created_at,
    });
    req.authSessionId = rows[0].session_id;

    touchSessionLastSeen(rows[0].session_id).catch((error) => {
      console.error("Failed to touch session timestamp:", error);
    });

    next();
  } catch (error) {
    next(error);
  }
}

function requireDatabaseMode(_req, res, next) {
  if (DEBUG_LOCAL_STORAGE) {
    res.status(503).json({
      error: "API task routes are disabled in DEBUG_LOCAL_STORAGE mode.",
    });
    return;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.authUser) {
    res.status(401).json({ error: "Please sign in." });
    return;
  }
  next();
}

async function initializeDatabase() {
  const adminPool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    waitForConnections: true,
    connectionLimit: 2,
    charset: "utf8mb4",
    timezone: "Z",
  });

  await adminPool.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await adminPool.end();

  pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: DB_CONNECTION_LIMIT,
    charset: "utf8mb4",
    timezone: "Z",
    dateStrings: true,
  });
}

async function ensureSchema() {
  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS users (
      id CHAR(36) NOT NULL PRIMARY KEY,
      email VARCHAR(320) NOT NULL,
      display_name VARCHAR(48) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uniq_users_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );

  await ensureUserDisplayNameColumn();
  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS sessions (
      id CHAR(36) NOT NULL PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      token_hash CHAR(64) NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uniq_sessions_token_hash (token_hash),
      KEY idx_sessions_user_id (user_id),
      KEY idx_sessions_expires_at (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );

  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS tasks (
      id CHAR(36) NOT NULL PRIMARY KEY,
      user_id CHAR(36) NULL,
      text VARCHAR(240) NOT NULL,
      has_due_date TINYINT(1) NOT NULL DEFAULT 1,
      due_date DATE NULL,
      is_completed TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      completed_at DATETIME(3) NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );

  await ensureTaskUserIdColumn();

  await ensureIndex(
    "tasks",
    "idx_tasks_order",
    "CREATE INDEX idx_tasks_order ON tasks (is_completed, has_due_date, due_date, created_at)"
  );

  await ensureIndex(
    "tasks",
    "idx_tasks_user_order",
    "CREATE INDEX idx_tasks_user_order ON tasks (user_id, is_completed, has_due_date, due_date, created_at)"
  );

  await ensureIndex(
    "sessions",
    "idx_sessions_expires_at",
    "CREATE INDEX idx_sessions_expires_at ON sessions (expires_at)"
  );

  await clearExpiredSessions();
}

async function ensureTaskUserIdColumn() {
  const [rows] = await pool.query("SHOW COLUMNS FROM tasks LIKE 'user_id'");
  if (rows.length === 0) {
    await pool.query("ALTER TABLE tasks ADD COLUMN user_id CHAR(36) NULL AFTER id");
  }
}

async function ensureUserDisplayNameColumn() {
  const [rows] = await pool.query("SHOW COLUMNS FROM users LIKE 'display_name'");
  if (rows.length === 0) {
    await pool.query("ALTER TABLE users ADD COLUMN display_name VARCHAR(48) NOT NULL DEFAULT '' AFTER email");
  }

  await pool.query(
    `
    UPDATE users
    SET display_name = TRIM(SUBSTRING_INDEX(email, '@', 1))
    WHERE display_name IS NULL OR TRIM(display_name) = ''
    `
  );
}

async function ensureIndex(tableName, indexName, createStatement) {
  if (!/^[a-z_]+$/i.test(tableName)) {
    throw new Error("Invalid table name for index check.");
  }

  const [rows] = await pool.query(`SHOW INDEX FROM \`${tableName}\` WHERE Key_name = ?`, [indexName]);
  if (rows.length === 0) {
    await pool.query(createStatement);
  }
}

async function isUsersTableEmpty() {
  const [rows] = await pool.query("SELECT COUNT(*) AS total FROM users");
  return Number(rows[0]?.total ?? 0) === 0;
}

async function createSessionForUser(userId, res) {
  await clearExpiredSessions();

  const sessionId = crypto.randomUUID();
  const token = crypto.randomBytes(48).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await pool.query(
    `
    INSERT INTO sessions (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
    `,
    [sessionId, userId, tokenHash, expiresAt]
  );

  setAuthCookie(res, token);
}

async function clearExpiredSessions() {
  await pool.query("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP(3)");
}

async function touchSessionLastSeen(sessionId) {
  await pool.query(
    `
    UPDATE sessions
    SET last_seen_at = CURRENT_TIMESTAMP(3)
    WHERE id = ?
      AND last_seen_at <= DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL ? SECOND)
    `,
    [sessionId, SESSION_TOUCH_INTERVAL_SECONDS]
  );
}

async function getUserById(userId) {
  const [rows] = await pool.query(
    `
    SELECT id, email, display_name, created_at
    FROM users
    WHERE id = ?
    LIMIT 1
    `,
    [userId]
  );

  if (rows.length === 0) {
    return null;
  }
  return fromDbUserRow(rows[0]);
}

async function getTaskById(taskId, userId, raw = false) {
  const [rows] = await pool.query(
    `
    SELECT id, user_id, text, has_due_date, due_date, is_completed, created_at, completed_at
    FROM tasks
    WHERE id = ? AND user_id = ?
    LIMIT 1
    `,
    [taskId, userId]
  );

  if (rows.length === 0) {
    return null;
  }
  return raw ? rows[0] : toApiTask(rows[0]);
}

function normalizeTaskText(value) {
  if (typeof value !== "string") {
    throw badRequest("Task text is required.");
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw badRequest("Task text cannot be empty.");
  }
  if (trimmed.length > MAX_TASK_TEXT_LENGTH) {
    throw badRequest(`Task text must be ${MAX_TASK_TEXT_LENGTH} characters or fewer.`);
  }

  return trimmed;
}

function normalizeDueDate(value) {
  if (typeof value !== "string" || !value) {
    return isoDay(new Date());
  }
  if (!ISO_DAY_REGEX.test(value)) {
    throw badRequest("Due date must use YYYY-MM-DD format.");
  }
  return value;
}

function normalizeEmail(value) {
  if (typeof value !== "string") {
    throw badRequest("Email is required.");
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    throw badRequest("Email is required.");
  }
  if (normalized.length > MAX_EMAIL_LENGTH || !EMAIL_REGEX.test(normalized)) {
    throw badRequest("Please enter a valid email address.");
  }

  return normalized;
}

function normalizeDisplayName(value, fallbackEmail = "") {
  const fallback = fallbackEmail.includes("@")
    ? fallbackEmail.slice(0, fallbackEmail.indexOf("@")).trim()
    : String(fallbackEmail || "").trim();

  const raw = typeof value === "string" ? value : fallback;
  const normalized = raw.trim();

  if (!normalized) {
    throw badRequest("Display name is required.");
  }

  if (normalized.length > MAX_DISPLAY_NAME_LENGTH) {
    throw badRequest(`Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`);
  }

  return normalized;
}

function normalizePassword(value) {
  if (typeof value !== "string") {
    throw badRequest("Password is required.");
  }

  if (value.length < MIN_PASSWORD_LENGTH) {
    throw badRequest(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  if (value.length > MAX_PASSWORD_LENGTH) {
    throw badRequest(`Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`);
  }

  return value;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hashBuffer = await scryptAsync(password, salt, 64);
  const hash = Buffer.from(hashBuffer).toString("hex");
  return `${salt}:${hash}`;
}

async function verifyPassword(password, storedPasswordHash) {
  if (typeof storedPasswordHash !== "string") {
    return false;
  }

  const [salt, expectedHash] = storedPasswordHash.split(":");
  if (!salt || !expectedHash) {
    return false;
  }

  let expectedBuffer;
  try {
    expectedBuffer = Buffer.from(expectedHash, "hex");
  } catch {
    return false;
  }

  const actualBuffer = Buffer.from(await scryptAsync(password, salt, expectedBuffer.length));
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function hashSessionToken(token) {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(token)
    .digest("hex");
}

function setAuthCookie(res, token) {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    path: "/",
  });
}

function readCookie(cookieHeader, name) {
  if (typeof cookieHeader !== "string" || !cookieHeader) {
    return "";
  }

  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const [key, ...valueParts] = pair.trim().split("=");
    if (key !== name) {
      continue;
    }

    const rawValue = valueParts.join("=");
    if (!rawValue) {
      return "";
    }

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return "";
}

function parseEnvBoolean(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

async function sendWelcomeEmail({ toEmail, displayName }) {
  if (!resend || !RESEND_FROM_EMAIL) {
    return;
  }

  const safeName = escapeHtml(displayName || toEmail);

  const { error } = await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to: [toEmail],
    subject: "Welcome to duee",
    html: [
      `<p>Hi ${safeName},</p>`,
      "<p>Your duee account is ready.</p>",
      "<p>You can now sign in on any device and your tasks will stay in sync.</p>",
      "<p>- duee</p>",
    ].join(""),
    text: [
      `Hi ${displayName || toEmail},`,
      "",
      "Your duee account is ready.",
      "You can now sign in on any device and your tasks will stay in sync.",
      "",
      "- duee",
    ].join("\n"),
  });

  if (error) {
    throw new Error(error.message || "Unknown Resend API error.");
  }
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function unauthorized(message) {
  const error = new Error(message);
  error.statusCode = 401;
  return error;
}

function conflict(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

function fromDbUserRow(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: toIsoDateTime(row.created_at),
  };
}

function toApiUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt ?? null,
  };
}

function toApiTask(row) {
  return {
    id: row.id,
    text: row.text,
    hasDueDate: Boolean(row.has_due_date),
    dueDate: row.due_date ?? null,
    isCompleted: Boolean(row.is_completed),
    createdAt: toIsoDateTime(row.created_at),
    completedAt: row.completed_at ? toIsoDateTime(row.completed_at) : null,
  };
}

function toIsoDateTime(mysqlDateTime) {
  if (!mysqlDateTime) {
    return null;
  }
  if (mysqlDateTime instanceof Date) {
    return mysqlDateTime.toISOString();
  }
  if (typeof mysqlDateTime === "string") {
    if (mysqlDateTime.includes("T")) {
      return mysqlDateTime.endsWith("Z") ? mysqlDateTime : `${mysqlDateTime}Z`;
    }
    return `${mysqlDateTime.replace(" ", "T")}Z`;
  }
  return new Date(mysqlDateTime).toISOString();
}

function isoDay(date) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
