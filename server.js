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
const HOSTNAME = process.env.HOSTNAME ?? "";
const PUBLIC_APP_ORIGIN = normalizeOptionalOrigin(process.env.PUBLIC_APP_ORIGIN ?? "");
const SESSION_TTL_DAYS = Number.parseInt(process.env.SESSION_TTL_DAYS ?? "30", 10);
const SESSION_TOUCH_INTERVAL_SECONDS = Number.parseInt(process.env.SESSION_TOUCH_INTERVAL_SECONDS ?? "300", 10);
const COOKIE_SECURE = parseEnvBoolean(process.env.COOKIE_SECURE, TRUST_PROXY);
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "";
const RESEND_WELCOME_EMAILS = parseEnvBoolean(process.env.RESEND_WELCOME_EMAILS, true);
const RESEND_AUTH_EMAILS = parseEnvBoolean(process.env.RESEND_AUTH_EMAILS, true);
const EMAIL_VERIFICATION_TOKEN_TTL_MINUTES = Number.parseInt(
  process.env.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES ?? "1440",
  10
);
const PASSWORD_RESET_TOKEN_TTL_MINUTES = Number.parseInt(
  process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES ?? "60",
  10
);
const AUTH_RATE_LIMIT_WINDOW_MS = Number.parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? "600000", 10);
const AUTH_RATE_LIMIT_MAX_REQUESTS = Number.parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS ?? "40", 10);
const TASK_MUTATION_RATE_LIMIT_WINDOW_MS = Number.parseInt(
  process.env.TASK_MUTATION_RATE_LIMIT_WINDOW_MS ?? "60000",
  10
);
const TASK_MUTATION_RATE_LIMIT_MAX_REQUESTS = Number.parseInt(
  process.env.TASK_MUTATION_RATE_LIMIT_MAX_REQUESTS ?? "120",
  10
);
const LOGIN_BRUTE_FORCE_WINDOW_MS = Number.parseInt(process.env.LOGIN_BRUTE_FORCE_WINDOW_MS ?? "900000", 10);
const LOGIN_BRUTE_FORCE_MAX_FAILURES = Number.parseInt(process.env.LOGIN_BRUTE_FORCE_MAX_FAILURES ?? "5", 10);
const LOGIN_BRUTE_FORCE_LOCK_MS = Number.parseInt(process.env.LOGIN_BRUTE_FORCE_LOCK_MS ?? "900000", 10);

const MAX_TASK_TEXT_LENGTH = 240;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const MAX_EMAIL_LENGTH = 320;
const MAX_DISPLAY_NAME_LENGTH = 48;
const ISO_DAY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ONE_TIME_TOKEN_REGEX = /^[A-Za-z0-9_-]{32,256}$/;
const DISPLAY_NAME_SANITIZER_REGEX = /[\u0000-\u001f\u007f]/g;
const TASK_TEXT_SANITIZER_REGEX = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const SESSION_COOKIE_NAME = "duee_session";
const CSRF_COOKIE_NAME = "duee_csrf";
const CSRF_HEADER_NAME = "x-csrf-token";
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const EMAIL_VERIFICATION_TOKEN_TTL_MS = EMAIL_VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000;
const PASSWORD_RESET_TOKEN_TTL_MS = PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000;
const DEFAULT_USER_PREFERENCES = Object.freeze({
  hideDone: false,
  receiveUpdates: true,
  confirmDeletes: true,
  horizontalTaskSections: false,
  sideCalendarVisible: true,
});

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

if (
  !Number.isFinite(EMAIL_VERIFICATION_TOKEN_TTL_MINUTES)
  || EMAIL_VERIFICATION_TOKEN_TTL_MINUTES < 5
  || EMAIL_VERIFICATION_TOKEN_TTL_MINUTES > 10080
) {
  throw new Error("EMAIL_VERIFICATION_TOKEN_TTL_MINUTES must be between 5 and 10080.");
}

if (
  !Number.isFinite(PASSWORD_RESET_TOKEN_TTL_MINUTES)
  || PASSWORD_RESET_TOKEN_TTL_MINUTES < 5
  || PASSWORD_RESET_TOKEN_TTL_MINUTES > 10080
) {
  throw new Error("PASSWORD_RESET_TOKEN_TTL_MINUTES must be between 5 and 10080.");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scryptAsync = promisify(crypto.scrypt);
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const authRateLimiter = createFixedWindowRateLimiter({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
  maxRequests: AUTH_RATE_LIMIT_MAX_REQUESTS,
  errorMessage: "Too many authentication requests. Please try again shortly.",
});
const taskMutationRateLimiter = createFixedWindowRateLimiter({
  windowMs: TASK_MUTATION_RATE_LIMIT_WINDOW_MS,
  maxRequests: TASK_MUTATION_RATE_LIMIT_MAX_REQUESTS,
  errorMessage: "Too many task changes. Please slow down and retry shortly.",
});
const loginFailureTracker = new Map();

const app = express();
app.disable("x-powered-by");
if (TRUST_PROXY) {
  app.set("trust proxy", 1);
}

app.use(applySecurityHeaders);
app.use(morgan("tiny"));
app.use(express.json({ limit: "1mb" }));
app.use(attachCsrfToken);
app.use(requireCsrfForMutations);
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

app.post(
  "/api/auth/email-verification/request",
  requireDatabaseMode,
  requireAuth,
  authRateLimiter,
  async (req, res, next) => {
    try {
      if (req.authUser.emailVerified) {
        res.json({ ok: true, alreadyVerified: true });
        return;
      }

      const verification = await issueEmailVerificationEmail({
        userId: req.authUser.id,
        toEmail: req.authUser.email,
        displayName: req.authUser.displayName,
        req,
      });

      await logAuditEvent({
        userId: req.authUser.id,
        action: "email_verification_requested",
        req,
        details: {
          expiresAt: verification.expiresAt,
        },
      });

      res.json({ ok: true, alreadyVerified: false });
    } catch (error) {
      next(error);
    }
  }
);

app.post("/api/auth/email-verification/verify", requireDatabaseMode, authRateLimiter, async (req, res, next) => {
  try {
    const token = normalizeOneTimeToken(req.body?.token, "Verification token");
    const result = await consumeEmailVerificationToken(token);

    if (req.authUser && req.authUser.id === result.userId) {
      req.authUser.emailVerifiedAt = result.emailVerifiedAt;
      req.authUser.emailVerified = true;
    }

    await logAuditEvent({
      userId: result.userId,
      action: "email_verification_completed",
      req,
      details: {
        alreadyVerified: result.alreadyVerified,
      },
    });

    res.json({
      ok: true,
      alreadyVerified: result.alreadyVerified,
      user: req.authUser && req.authUser.id === result.userId ? toApiUser(req.authUser) : null,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/password-reset/request", requireDatabaseMode, authRateLimiter, async (req, res, next) => {
  try {
    assertAuthEmailDeliveryConfigured();
    const email = normalizeEmail(req.body?.email);
    const user = await getUserByEmail(email);

    if (user) {
      const resetMeta = await issuePasswordResetEmail({
        userId: user.id,
        toEmail: user.email,
        displayName: user.displayName,
        req,
      });

      await logAuditEvent({
        userId: user.id,
        action: "password_reset_requested",
        req,
        details: {
          expiresAt: resetMeta.expiresAt,
        },
      });
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/password-reset/confirm", requireDatabaseMode, authRateLimiter, async (req, res, next) => {
  try {
    const token = normalizeOneTimeToken(req.body?.token, "Reset token");
    const nextPassword = normalizePassword(req.body?.password);
    const passwordHash = await hashPassword(nextPassword);
    const result = await consumePasswordResetToken(token, passwordHash);

    clearAuthCookie(res);
    clearCsrfCookie(res);

    await logAuditEvent({
      userId: result.userId,
      action: "password_reset_completed",
      req,
      details: {
        allSessionsRevoked: true,
      },
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/register", requireDatabaseMode, authRateLimiter, async (req, res, next) => {
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

    if (RESEND_AUTH_EMAILS) {
      try {
        const verification = await issueEmailVerificationEmail({
          userId,
          toEmail: email,
          displayName,
          req,
        });
        await logAuditEvent({
          userId,
          action: "email_verification_requested",
          req,
          details: {
            source: "register",
            expiresAt: verification.expiresAt,
          },
        });
      } catch (sendError) {
        console.error("Failed to send verification email:", sendError);
      }
    }

    res.status(201).json({
      user: user ? toApiUser(user) : {
        id: userId,
        email,
        displayName,
        createdAt: new Date().toISOString(),
        emailVerified: false,
        emailVerifiedAt: null,
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

app.post("/api/auth/login", requireDatabaseMode, authRateLimiter, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = normalizePassword(req.body?.password);
    assertLoginNotLocked(email, req);

    const [rows] = await pool.query(
      `
      SELECT id, email, display_name, password_hash, created_at, email_verified_at
      FROM users
      WHERE email = ?
      LIMIT 1
      `,
      [email]
    );

    if (rows.length === 0 || !(await verifyPassword(password, rows[0].password_hash))) {
      recordFailedLoginAttempt(email, req);
      throw unauthorized("Invalid email or password.");
    }

    const user = rows[0];
    clearFailedLoginAttempts(email, req);
    await createSessionForUser(user.id, res);

    res.json({
      user: toApiUser(fromDbUserRow(user)),
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/auth/profile", requireDatabaseMode, requireAuth, authRateLimiter, async (req, res, next) => {
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

app.get("/api/auth/export", requireDatabaseMode, requireAuth, authRateLimiter, async (req, res, next) => {
  try {
    const payload = await buildAccountExportPayload(req.authUser.id);
    await logAuditEvent({
      userId: req.authUser.id,
      action: "account_export",
      req,
      details: {
        taskCount: payload.tasks.length,
        sessionCount: payload.sessions.length,
      },
    });
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/export/download", requireDatabaseMode, requireAuth, authRateLimiter, async (req, res, next) => {
  try {
    const payload = await buildAccountExportPayload(req.authUser.id);
    await logAuditEvent({
      userId: req.authUser.id,
      action: "account_export_download",
      req,
      details: {
        taskCount: payload.tasks.length,
        sessionCount: payload.sessions.length,
      },
    });

    const timestamp = new Date().toISOString().replaceAll(":", "-");
    const filename = `duee-account-export-${timestamp}.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/auth/account", requireDatabaseMode, requireAuth, authRateLimiter, async (req, res, next) => {
  const userId = req.authUser.id;

  try {
    const password = normalizePassword(req.body?.password);
    const [rows] = await pool.query(
      `
      SELECT password_hash
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (rows.length === 0) {
      throw unauthorized("Please sign in.");
    }

    if (!(await verifyPassword(password, rows[0].password_hash))) {
      throw unauthorized("Password is incorrect.");
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query("DELETE FROM tasks WHERE user_id = ?", [userId]);
      await connection.query("DELETE FROM user_preferences WHERE user_id = ?", [userId]);
      await connection.query("DELETE FROM sessions WHERE user_id = ?", [userId]);
      await connection.query("DELETE FROM email_verification_tokens WHERE user_id = ?", [userId]);
      await connection.query("DELETE FROM password_reset_tokens WHERE user_id = ?", [userId]);
      await connection.query("DELETE FROM audit_logs WHERE user_id = ?", [userId]);
      await connection.query("DELETE FROM users WHERE id = ?", [userId]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    clearAuthCookie(res);
    clearCsrfCookie(res);

    await logAuditEvent({
      userId: null,
      action: "account_delete",
      req,
      details: { deletedUserId: userId },
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/prefs", requireDatabaseMode, requireAuth, async (req, res, next) => {
  try {
    const prefs = await getUserPreferences(req.authUser.id);
    res.json({ prefs });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/prefs", requireDatabaseMode, requireAuth, async (req, res, next) => {
  try {
    const patch = normalizePreferencePatch(req.body);
    const current = await getUserPreferences(req.authUser.id);
    const merged = {
      ...current,
      ...patch,
    };
    const prefs = await saveUserPreferences(req.authUser.id, merged);
    res.json({ prefs });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", authRateLimiter, async (req, res, next) => {
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
    clearCsrfCookie(res);
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

app.post("/api/tasks", requireDatabaseMode, requireAuth, taskMutationRateLimiter, async (req, res, next) => {
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

app.patch("/api/tasks/:id", requireDatabaseMode, requireAuth, taskMutationRateLimiter, async (req, res, next) => {
  try {
    const taskId = normalizeUUID(req.params.id, "Task ID");
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

app.delete("/api/tasks/:id", requireDatabaseMode, requireAuth, taskMutationRateLimiter, async (req, res, next) => {
  try {
    const taskId = normalizeUUID(req.params.id, "Task ID");
    const [result] = await pool.query(
      "DELETE FROM tasks WHERE id = ? AND user_id = ?",
      [taskId, req.authUser.id]
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

  if ((RESEND_WELCOME_EMAILS || RESEND_AUTH_EMAILS) && (!resend || !RESEND_FROM_EMAIL)) {
    console.warn(
      "Resend email features are enabled but not fully configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL."
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

function applySecurityHeaders(req, res, next) {
  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");
  }

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
    ].join("; ")
  );
  next();
}

function attachCsrfToken(req, res, next) {
  if (!req.path.startsWith("/api/")) {
    next();
    return;
  }

  const existing = readCookie(req.headers.cookie, CSRF_COOKIE_NAME);
  const csrfToken = isLikelyCsrfToken(existing) ? existing : createCsrfToken();

  req.csrfToken = csrfToken;
  if (csrfToken !== existing) {
    setCsrfCookie(res, csrfToken);
  }

  next();
}

function requireCsrfForMutations(req, res, next) {
  if (!req.path.startsWith("/api/")) {
    next();
    return;
  }

  const method = String(req.method || "").toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    next();
    return;
  }

  const cookieToken = readCookie(req.headers.cookie, CSRF_COOKIE_NAME);
  const headerToken = String(req.get(CSRF_HEADER_NAME) || "");
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({ error: "Invalid CSRF token." });
    return;
  }

  next();
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
      SELECT s.id AS session_id, s.user_id, u.email, u.display_name, u.created_at, u.email_verified_at
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
      clearCsrfCookie(res);
      next();
      return;
    }

    req.authUser = fromDbUserRow({
      id: rows[0].user_id,
      email: rows[0].email,
      display_name: rows[0].display_name,
      created_at: rows[0].created_at,
      email_verified_at: rows[0].email_verified_at,
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

function createFixedWindowRateLimiter({ windowMs, maxRequests, errorMessage }) {
  const buckets = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = `${extractClientIP(req)}:${req.path}`;
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    existing.count += 1;
    if (existing.count > maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader("Retry-After", `${retryAfterSeconds}`);
      res.status(429).json({ error: errorMessage });
      return;
    }

    next();
  };
}

function assertLoginNotLocked(email, req) {
  const key = buildLoginFailureKey(email, req);
  const entry = loginFailureTracker.get(key);
  if (!entry) {
    return;
  }

  const now = Date.now();
  if (entry.lockedUntil && entry.lockedUntil > now) {
    throw tooManyRequests("Too many failed login attempts. Please try again later.");
  }

  if (entry.windowStartedAt + LOGIN_BRUTE_FORCE_WINDOW_MS <= now) {
    loginFailureTracker.delete(key);
  }
}

function recordFailedLoginAttempt(email, req) {
  const key = buildLoginFailureKey(email, req);
  const now = Date.now();
  const existing = loginFailureTracker.get(key);

  if (!existing || existing.windowStartedAt + LOGIN_BRUTE_FORCE_WINDOW_MS <= now) {
    loginFailureTracker.set(key, {
      failures: 1,
      windowStartedAt: now,
      lockedUntil: null,
    });
    return;
  }

  existing.failures += 1;
  if (existing.failures >= LOGIN_BRUTE_FORCE_MAX_FAILURES) {
    existing.lockedUntil = now + LOGIN_BRUTE_FORCE_LOCK_MS;
  }
}

function clearFailedLoginAttempts(email, req) {
  const key = buildLoginFailureKey(email, req);
  loginFailureTracker.delete(key);
}

function buildLoginFailureKey(email, req) {
  return `${email}:${extractClientIP(req)}`;
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
      email_verified_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uniq_users_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );

  await ensureUserDisplayNameColumn();
  await ensureUserEmailVerifiedColumn();
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

  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id CHAR(36) NOT NULL PRIMARY KEY,
      hide_done TINYINT(1) NOT NULL DEFAULT 0,
      receive_updates TINYINT(1) NOT NULL DEFAULT 1,
      confirm_deletes TINYINT(1) NOT NULL DEFAULT 1,
      horizontal_task_sections TINYINT(1) NOT NULL DEFAULT 0,
      side_calendar_visible TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );

  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS audit_logs (
      id CHAR(36) NOT NULL PRIMARY KEY,
      user_id CHAR(36) NULL,
      action VARCHAR(64) NOT NULL,
      ip_address VARCHAR(128) NULL,
      user_agent VARCHAR(512) NULL,
      details_json JSON NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY idx_audit_logs_user_id_created_at (user_id, created_at),
      KEY idx_audit_logs_action_created_at (action, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );

  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id CHAR(36) NOT NULL PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      token_hash CHAR(64) NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      consumed_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uniq_email_verification_token_hash (token_hash),
      KEY idx_email_verification_tokens_user_id (user_id),
      KEY idx_email_verification_tokens_expires_at (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );

  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id CHAR(36) NOT NULL PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      token_hash CHAR(64) NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      consumed_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uniq_password_reset_token_hash (token_hash),
      KEY idx_password_reset_tokens_user_id (user_id),
      KEY idx_password_reset_tokens_expires_at (expires_at)
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

  await ensureIndex(
    "audit_logs",
    "idx_audit_logs_user_id_created_at",
    "CREATE INDEX idx_audit_logs_user_id_created_at ON audit_logs (user_id, created_at)"
  );

  await ensureIndex(
    "audit_logs",
    "idx_audit_logs_action_created_at",
    "CREATE INDEX idx_audit_logs_action_created_at ON audit_logs (action, created_at)"
  );

  await clearExpiredSessions();
  await clearExpiredAuthTokens();
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

async function ensureUserEmailVerifiedColumn() {
  const [rows] = await pool.query("SHOW COLUMNS FROM users LIKE 'email_verified_at'");
  if (rows.length === 0) {
    await pool.query("ALTER TABLE users ADD COLUMN email_verified_at DATETIME(3) NULL AFTER password_hash");
  }
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
  setCsrfCookie(res, createCsrfToken());
}

async function issueEmailVerificationEmail({ userId, toEmail, displayName, req }) {
  assertAuthEmailDeliveryConfigured();
  await clearExpiredAuthTokens();

  const token = createOneTimeToken();
  const tokenHash = hashOneTimeToken(token, "email-verification");
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS);
  const tokenId = crypto.randomUUID();

  await pool.query(
    "DELETE FROM email_verification_tokens WHERE user_id = ? AND consumed_at IS NULL",
    [userId]
  );
  await pool.query(
    `
    INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
    `,
    [tokenId, userId, tokenHash, expiresAt]
  );

  const verificationUrl = buildAuthActionUrl(req, "verify_email_token", token);
  await sendEmailVerificationEmail({
    toEmail,
    displayName,
    verificationUrl,
  });

  return {
    tokenId,
    expiresAt: expiresAt.toISOString(),
  };
}

async function consumeEmailVerificationToken(token) {
  await clearExpiredAuthTokens();

  const tokenHash = hashOneTimeToken(token, "email-verification");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `
      SELECT id, user_id, expires_at, consumed_at
      FROM email_verification_tokens
      WHERE token_hash = ?
      LIMIT 1
      FOR UPDATE
      `,
      [tokenHash]
    );

    if (rows.length === 0) {
      throw badRequest("Verification link is invalid or has expired.");
    }

    const match = rows[0];
    if (match.consumed_at || isDateTimeExpired(match.expires_at)) {
      await connection.query("DELETE FROM email_verification_tokens WHERE id = ?", [match.id]);
      throw badRequest("Verification link is invalid or has expired.");
    }

    const [userRows] = await connection.query(
      `
      SELECT email_verified_at
      FROM users
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [match.user_id]
    );

    if (userRows.length === 0) {
      throw badRequest("Verification link is invalid or has expired.");
    }

    const alreadyVerified = Boolean(userRows[0].email_verified_at);
    if (!alreadyVerified) {
      await connection.query(
        `
        UPDATE users
        SET email_verified_at = CURRENT_TIMESTAMP(3)
        WHERE id = ?
        `,
        [match.user_id]
      );
    }

    await connection.query(
      `
      UPDATE email_verification_tokens
      SET consumed_at = CURRENT_TIMESTAMP(3)
      WHERE id = ?
      `,
      [match.id]
    );
    await connection.query(
      "DELETE FROM email_verification_tokens WHERE user_id = ? AND id <> ?",
      [match.user_id, match.id]
    );

    const [freshRows] = await connection.query(
      `
      SELECT email_verified_at
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [match.user_id]
    );

    await connection.commit();
    return {
      userId: match.user_id,
      alreadyVerified,
      emailVerifiedAt: toIsoDateTime(freshRows[0]?.email_verified_at) ?? new Date().toISOString(),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function issuePasswordResetEmail({ userId, toEmail, displayName, req }) {
  assertAuthEmailDeliveryConfigured();
  await clearExpiredAuthTokens();

  const token = createOneTimeToken();
  const tokenHash = hashOneTimeToken(token, "password-reset");
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);
  const tokenId = crypto.randomUUID();

  await pool.query(
    "DELETE FROM password_reset_tokens WHERE user_id = ? AND consumed_at IS NULL",
    [userId]
  );
  await pool.query(
    `
    INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
    `,
    [tokenId, userId, tokenHash, expiresAt]
  );

  const resetUrl = buildAuthActionUrl(req, "reset_password_token", token);
  await sendPasswordResetEmail({
    toEmail,
    displayName,
    resetUrl,
  });

  return {
    tokenId,
    expiresAt: expiresAt.toISOString(),
  };
}

async function consumePasswordResetToken(token, nextPasswordHash) {
  await clearExpiredAuthTokens();

  const tokenHash = hashOneTimeToken(token, "password-reset");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `
      SELECT id, user_id, expires_at, consumed_at
      FROM password_reset_tokens
      WHERE token_hash = ?
      LIMIT 1
      FOR UPDATE
      `,
      [tokenHash]
    );

    if (rows.length === 0) {
      throw badRequest("Reset link is invalid or has expired.");
    }

    const match = rows[0];
    if (match.consumed_at || isDateTimeExpired(match.expires_at)) {
      await connection.query("DELETE FROM password_reset_tokens WHERE id = ?", [match.id]);
      throw badRequest("Reset link is invalid or has expired.");
    }

    const [userRows] = await connection.query(
      `
      SELECT id
      FROM users
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [match.user_id]
    );

    if (userRows.length === 0) {
      throw badRequest("Reset link is invalid or has expired.");
    }

    await connection.query(
      `
      UPDATE users
      SET password_hash = ?
      WHERE id = ?
      `,
      [nextPasswordHash, match.user_id]
    );

    await connection.query(
      `
      UPDATE password_reset_tokens
      SET consumed_at = CURRENT_TIMESTAMP(3)
      WHERE id = ?
      `,
      [match.id]
    );
    await connection.query(
      "DELETE FROM password_reset_tokens WHERE user_id = ? AND id <> ?",
      [match.user_id, match.id]
    );
    await connection.query("DELETE FROM sessions WHERE user_id = ?", [match.user_id]);

    await connection.commit();
    return {
      userId: match.user_id,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function clearExpiredSessions() {
  await pool.query("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP(3)");
}

async function clearExpiredAuthTokens() {
  await pool.query(
    "DELETE FROM email_verification_tokens WHERE expires_at <= CURRENT_TIMESTAMP(3) OR consumed_at IS NOT NULL"
  );
  await pool.query(
    "DELETE FROM password_reset_tokens WHERE expires_at <= CURRENT_TIMESTAMP(3) OR consumed_at IS NOT NULL"
  );
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
    SELECT id, email, display_name, created_at, email_verified_at
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

async function getUserByEmail(email) {
  const [rows] = await pool.query(
    `
    SELECT id, email, display_name, created_at, email_verified_at
    FROM users
    WHERE email = ?
    LIMIT 1
    `,
    [email]
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

async function buildAccountExportPayload(userId) {
  const user = await getUserById(userId);
  if (!user) {
    throw unauthorized("Please sign in.");
  }

  const [taskRows] = await pool.query(
    `
    SELECT id, text, has_due_date, due_date, is_completed, created_at, completed_at
    FROM tasks
    WHERE user_id = ?
    ORDER BY is_completed ASC, has_due_date DESC, due_date ASC, created_at ASC
    `,
    [userId]
  );

  const [sessionRows] = await pool.query(
    `
    SELECT id, created_at, last_seen_at, expires_at
    FROM sessions
    WHERE user_id = ?
    ORDER BY created_at ASC
    `,
    [userId]
  );

  const preferences = await getUserPreferences(userId);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    user: toApiUser(user),
    preferences,
    tasks: taskRows.map(toApiTask),
    sessions: sessionRows.map((row) => ({
      id: row.id,
      createdAt: toIsoDateTime(row.created_at),
      lastSeenAt: toIsoDateTime(row.last_seen_at),
      expiresAt: toIsoDateTime(row.expires_at),
    })),
  };
}

async function logAuditEvent({ userId = null, action, req, details = {} }) {
  if (!pool) {
    return;
  }

  const id = crypto.randomUUID();
  const ipAddress = truncateText(extractClientIP(req), 128);
  const userAgent = truncateText(req?.get?.("user-agent") ?? "", 512);
  const detailsJson = safeJsonStringify(details);

  await pool.query(
    `
    INSERT INTO audit_logs (id, user_id, action, ip_address, user_agent, details_json)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [id, userId, action, ipAddress, userAgent, detailsJson]
  );
}

async function getUserPreferences(userId) {
  const [rows] = await pool.query(
    `
    SELECT hide_done, receive_updates, confirm_deletes, horizontal_task_sections, side_calendar_visible
    FROM user_preferences
    WHERE user_id = ?
    LIMIT 1
    `,
    [userId]
  );

  if (rows.length === 0) {
    return {
      ...DEFAULT_USER_PREFERENCES,
    };
  }

  return toApiPreferences(rows[0]);
}

async function saveUserPreferences(userId, prefs) {
  await pool.query(
    `
    INSERT INTO user_preferences (
      user_id, hide_done, receive_updates, confirm_deletes, horizontal_task_sections, side_calendar_visible
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      hide_done = VALUES(hide_done),
      receive_updates = VALUES(receive_updates),
      confirm_deletes = VALUES(confirm_deletes),
      horizontal_task_sections = VALUES(horizontal_task_sections),
      side_calendar_visible = VALUES(side_calendar_visible)
    `,
    [
      userId,
      prefs.hideDone ? 1 : 0,
      prefs.receiveUpdates ? 1 : 0,
      prefs.confirmDeletes ? 1 : 0,
      prefs.horizontalTaskSections ? 1 : 0,
      prefs.sideCalendarVisible ? 1 : 0,
    ]
  );

  return getUserPreferences(userId);
}

function normalizePreferencePatch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest("Invalid preferences payload.");
  }

  const allowedKeys = new Set([
    "hideDone",
    "receiveUpdates",
    "confirmDeletes",
    "horizontalTaskSections",
    "sideCalendarVisible",
  ]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw badRequest(`Unknown preference field: ${key}`);
    }
  }

  const patch = {};
  if (value.hideDone !== undefined) {
    patch.hideDone = Boolean(value.hideDone);
  }
  if (value.receiveUpdates !== undefined) {
    patch.receiveUpdates = Boolean(value.receiveUpdates);
  }
  if (value.confirmDeletes !== undefined) {
    patch.confirmDeletes = Boolean(value.confirmDeletes);
  }
  if (value.horizontalTaskSections !== undefined) {
    patch.horizontalTaskSections = Boolean(value.horizontalTaskSections);
  }
  if (value.sideCalendarVisible !== undefined) {
    patch.sideCalendarVisible = Boolean(value.sideCalendarVisible);
  }

  if (Object.keys(patch).length === 0) {
    throw badRequest("At least one preference field is required.");
  }

  return patch;
}

function normalizeTaskText(value) {
  if (typeof value !== "string") {
    throw badRequest("Task text is required.");
  }

  const sanitized = value.replace(TASK_TEXT_SANITIZER_REGEX, "");
  const trimmed = sanitized.trim();
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
  if (!isRealIsoDay(value)) {
    throw badRequest("Due date must be a real calendar date.");
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
  const normalized = raw.replace(DISPLAY_NAME_SANITIZER_REGEX, "").trim();

  if (!normalized) {
    throw badRequest("Display name is required.");
  }

  if (normalized.length > MAX_DISPLAY_NAME_LENGTH) {
    throw badRequest(`Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`);
  }

  return normalized;
}

function normalizeUUID(value, label = "ID") {
  if (typeof value !== "string" || !UUID_REGEX.test(value)) {
    throw badRequest(`${label} must be a valid UUID.`);
  }
  return value.toLowerCase();
}

function normalizeOneTimeToken(value, label = "Token") {
  if (typeof value !== "string") {
    throw badRequest(`${label} is required.`);
  }

  const normalized = value.trim();
  if (!normalized || !ONE_TIME_TOKEN_REGEX.test(normalized)) {
    throw badRequest(`${label} is invalid.`);
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

function createOneTimeToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashOneTimeToken(token, purpose) {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(`${purpose}:${token}`)
    .digest("hex");
}

function isDateTimeExpired(value) {
  const date = parseDateTime(value);
  if (!date) {
    return true;
  }
  return date.getTime() <= Date.now();
}

function parseDateTime(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string") {
    const normalized = value.includes("T")
      ? (value.endsWith("Z") ? value : `${value}Z`)
      : `${value.replace(" ", "T")}Z`;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

function setCsrfCookie(res, token) {
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
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

function clearCsrfCookie(res) {
  res.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: false,
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

function createCsrfToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function isLikelyCsrfToken(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(value);
}

function extractClientIP(req) {
  const value = req?.ip || req?.socket?.remoteAddress || "";
  return truncateText(String(value || ""), 128);
}

function truncateText(value, maxLength) {
  const safeValue = typeof value === "string" ? value : String(value ?? "");
  if (safeValue.length <= maxLength) {
    return safeValue;
  }
  return safeValue.slice(0, maxLength);
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return JSON.stringify({ error: "unserializable_details" });
  }
}

function isRealIsoDay(value) {
  if (!ISO_DAY_REGEX.test(value)) {
    return false;
  }

  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.getUTCFullYear() === year
    && utc.getUTCMonth() === month - 1
    && utc.getUTCDate() === day;
}

function normalizeOptionalOrigin(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("PUBLIC_APP_ORIGIN must use http or https.");
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    throw new Error("PUBLIC_APP_ORIGIN must be a valid absolute URL.");
  }
}

function firstForwardedHeaderValue(value) {
  if (typeof value !== "string") {
    return "";
  }

  const [first] = value.split(",");
  return (first || "").trim();
}

function resolveAppOrigin(req) {
  if (PUBLIC_APP_ORIGIN) {
    return PUBLIC_APP_ORIGIN;
  }

  const forwardedHost = TRUST_PROXY ? firstForwardedHeaderValue(req?.get?.("x-forwarded-host")) : "";
  const host = forwardedHost || req?.get?.("host") || HOSTNAME;
  if (!host) {
    return "";
  }

  if (host.includes("://")) {
    return normalizeOptionalOrigin(host);
  }

  const forwardedProto = TRUST_PROXY ? firstForwardedHeaderValue(req?.get?.("x-forwarded-proto")) : "";
  const protocol = forwardedProto || req?.protocol || (COOKIE_SECURE ? "https" : "http");
  return `${protocol}://${host}`;
}

function buildAuthActionUrl(req, queryKey, token) {
  const origin = resolveAppOrigin(req);
  if (!origin) {
    throw serviceUnavailable("Public app origin is not configured.");
  }

  const url = new URL("/", origin);
  url.searchParams.set(queryKey, token);
  return url.toString();
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

function assertAuthEmailDeliveryConfigured() {
  if (!RESEND_AUTH_EMAILS) {
    throw serviceUnavailable("Email verification and password reset are currently disabled.");
  }

  if (!resend || !RESEND_FROM_EMAIL) {
    throw serviceUnavailable("Email delivery is not configured.");
  }
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

async function sendEmailVerificationEmail({ toEmail, displayName, verificationUrl }) {
  assertAuthEmailDeliveryConfigured();
  const safeName = escapeHtml(displayName || toEmail);
  const safeUrl = escapeHtml(verificationUrl);

  const { error } = await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to: [toEmail],
    subject: "Verify your duee email",
    html: [
      `<p>Hi ${safeName},</p>`,
      "<p>Tap the link below to verify your email address:</p>",
      `<p><a href="${safeUrl}">Verify email</a></p>`,
      "<p>If you didn't create this account, you can ignore this email.</p>",
      "<p>- duee</p>",
    ].join(""),
    text: [
      `Hi ${displayName || toEmail},`,
      "",
      "Open this link to verify your email address:",
      verificationUrl,
      "",
      "If you didn't create this account, you can ignore this email.",
      "",
      "- duee",
    ].join("\n"),
  });

  if (error) {
    throw new Error(error.message || "Unknown Resend API error.");
  }
}

async function sendPasswordResetEmail({ toEmail, displayName, resetUrl }) {
  assertAuthEmailDeliveryConfigured();
  const safeName = escapeHtml(displayName || toEmail);
  const safeUrl = escapeHtml(resetUrl);

  const { error } = await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to: [toEmail],
    subject: "Reset your duee password",
    html: [
      `<p>Hi ${safeName},</p>`,
      "<p>Tap the link below to reset your password:</p>",
      `<p><a href="${safeUrl}">Reset password</a></p>`,
      "<p>If you didn't request a password reset, you can safely ignore this email.</p>",
      "<p>- duee</p>",
    ].join(""),
    text: [
      `Hi ${displayName || toEmail},`,
      "",
      "Open this link to reset your password:",
      resetUrl,
      "",
      "If you didn't request a password reset, you can safely ignore this email.",
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

function tooManyRequests(message) {
  const error = new Error(message);
  error.statusCode = 429;
  return error;
}

function serviceUnavailable(message) {
  const error = new Error(message);
  error.statusCode = 503;
  return error;
}

function fromDbUserRow(row) {
  const emailVerifiedAt = row.email_verified_at ? toIsoDateTime(row.email_verified_at) : null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: toIsoDateTime(row.created_at),
    emailVerifiedAt,
    emailVerified: Boolean(emailVerifiedAt),
  };
}

function toApiUser(user) {
  const emailVerifiedAt = user.emailVerifiedAt ?? null;
  const emailVerified = Boolean(user.emailVerified) || Boolean(emailVerifiedAt);
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt ?? null,
    emailVerified,
    emailVerifiedAt,
  };
}

function toApiPreferences(row) {
  return {
    hideDone: row.hide_done === undefined
      ? DEFAULT_USER_PREFERENCES.hideDone
      : Boolean(row.hide_done),
    receiveUpdates: row.receive_updates === undefined
      ? DEFAULT_USER_PREFERENCES.receiveUpdates
      : Boolean(row.receive_updates),
    confirmDeletes: row.confirm_deletes === undefined
      ? DEFAULT_USER_PREFERENCES.confirmDeletes
      : Boolean(row.confirm_deletes),
    horizontalTaskSections: row.horizontal_task_sections === undefined
      ? DEFAULT_USER_PREFERENCES.horizontalTaskSections
      : Boolean(row.horizontal_task_sections),
    sideCalendarVisible: row.side_calendar_visible === undefined
      ? DEFAULT_USER_PREFERENCES.sideCalendarVisible
      : Boolean(row.side_calendar_visible),
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
