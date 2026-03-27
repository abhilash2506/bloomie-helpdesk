const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'bloomie.sqlite');
const LOG_DIR = path.join(__dirname, 'logs');
const BACKUP_DIR = path.join(__dirname, 'backups');
const HOST = process.env.BLOOMIE_HOST || process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.BLOOMIE_PORT || process.env.PORT || 4180);
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const HMAC_SECRET = process.env.BLOOMIE_SECRET || 'bloomie-local-secret-change-me';
const DEFAULT_MASTER_PASS = process.env.BLOOMIE_MASTER_PASS || 'Bloomie@9271#Master';
const APP_BASE_URL = process.env.BLOOMIE_BASE_URL || `http://${HOST}:${PORT}`;
const AUTH_RATE_LIMIT_MAX = Number(process.env.BLOOMIE_AUTH_RATE_LIMIT_MAX || 30);
const AUTH_RATE_LIMIT_WINDOW_MS = Number(process.env.BLOOMIE_AUTH_RATE_LIMIT_WINDOW_MS || 5 * 60 * 1000);
const API_RATE_LIMIT_MAX = Number(process.env.BLOOMIE_API_RATE_LIMIT_MAX || 300);
const API_RATE_LIMIT_WINDOW_MS = Number(process.env.BLOOMIE_API_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const SHEET_SYNC_INTERVAL_MS = Number(process.env.BLOOMIE_SYNC_INTERVAL_MS || 15 * 60 * 1000);
const BACKUP_INTERVAL_MS = Number(process.env.BLOOMIE_BACKUP_INTERVAL_MS || 6 * 60 * 60 * 1000);

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout = 5000;');
const rateLimitStore = new Map();
const metrics = {
  startedAt: Date.now(),
  requestsTotal: 0,
  requestsByRoute: {},
  statusByCode: {},
  rateLimitBlocks: 0,
  authFailures: 0,
  errors: 0,
  lastError: null,
  lastBackupAt: null,
  lastSyncRunAt: null
};

function nowIso() {
  return new Date().toISOString();
}

function appendLog(fileName, line) {
  try {
    fs.appendFileSync(path.join(LOG_DIR, fileName), `${nowIso()} ${line}\n`);
  } catch {}
}

function recordError(err, context = 'runtime') {
  metrics.errors += 1;
  metrics.lastError = { time: nowIso(), context, message: err && err.message ? err.message : String(err) };
  appendLog('error.log', `[${context}] ${metrics.lastError.message}`);
}

function hashText(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password || ''), String(salt || ''), 64).toString('hex');
}

function genSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function signValue(value) {
  return crypto.createHmac('sha256', HMAC_SECRET).update(value).digest('hex');
}

function createSessionToken(sessionId, userId, tenantId, expiresAt) {
  const payload = `${sessionId}.${userId}.${tenantId}.${expiresAt}`;
  return `${payload}.${signValue(payload)}`;
}

function verifySessionToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 5) return null;
  const [sessionId, userId, tenantId, expiresAt, sig] = parts;
  const payload = `${sessionId}.${userId}.${tenantId}.${expiresAt}`;
  if (signValue(payload) !== sig) return null;
  if (Number(expiresAt) < Date.now()) return null;
  return { sessionId, userId, tenantId, expiresAt: Number(expiresAt) };
}

function parseJsonSafe(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function json(value) {
  return JSON.stringify(value ?? {});
}

function cleanText(value, max = 5000) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
}

function cleanId(value, prefix = 'BLM') {
  const out = String(value || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 64);
  return out || `${prefix}_${Date.now()}`;
}

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (forwarded) return forwarded;
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

function isLocalRequest(req) {
  const clientIp = getClientIp(req);
  const host = String(req.headers.host || '').split(':')[0].trim().toLowerCase();
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'].includes(clientIp)
    || ['127.0.0.1', 'localhost'].includes(host);
}

function looksLikePlaceholderSecret(value) {
  const normalized = cleanText(value, 300).toLowerCase();
  if (!normalized) return true;
  return [
    'prod-',
    'test-',
    'demo-',
    'sample-',
    'example',
    'changeme',
    'replace-me',
    'your-',
    'dummy'
  ].some(token => normalized.includes(token));
}

function isSsoProviderConfigured(row) {
  if (!row || !row.enabled || !row.client_id || !row.client_secret || !row.redirect_uri) return false;
  return !looksLikePlaceholderSecret(row.client_id) && !looksLikePlaceholderSecret(row.client_secret);
}

function trackMetric(route, statusCode) {
  metrics.requestsTotal += 1;
  metrics.requestsByRoute[route] = (metrics.requestsByRoute[route] || 0) + 1;
  const key = String(statusCode);
  metrics.statusByCode[key] = (metrics.statusByCode[key] || 0) + 1;
}

function checkRateLimit(req, res, bucket, max, windowMs) {
  const clientIp = getClientIp(req);
  const routeKey = req.url ? String(req.url).split('?')[0] : '';
  const key = `${bucket}:${clientIp}:${routeKey}`;
  const now = Date.now();
  const entry = rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };
  if (entry.resetAt <= now) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  entry.count += 1;
  rateLimitStore.set(key, entry);
  if (entry.count > max) {
    metrics.rateLimitBlocks += 1;
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    sendJson(res, 429, { error: 'Too many requests', retryAfter });
    return false;
  }
  return true;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 2 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'microphone=(), camera=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text, type = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'microphone=(), camera=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  });
  res.end(text);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
    '.css': 'text/css; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.svg': 'image/svg+xml'
  })[ext] || 'application/octet-stream';
}

function serveStatic(req, res, pathname) {
  const resolved = pathname === '/' ? '/bloomie-helpdesk-v1.html' : pathname;
  const requestedPath = path.join(ROOT, resolved.replace(/^\/+/, ''));
  if (!requestedPath.startsWith(ROOT)) {
    sendText(res, 403, 'Forbidden');
    return;
  }
  const filePath = requestedPath;
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(res, 404, 'Not Found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': contentTypeFor(filePath),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'microphone=(), camera=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  });
  fs.createReadStream(filePath).pipe(res);
}

function initDb() {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      tenant_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      plan TEXT NOT NULL,
      primary_domain TEXT,
      branding_json TEXT NOT NULL DEFAULT '{}',
      security_json TEXT NOT NULL DEFAULT '{}',
      config_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      emp_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      dept TEXT,
      property TEXT,
      role TEXT NOT NULL,
      user_type TEXT NOT NULL DEFAULT 'associate',
      status TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(tenant_id, emp_id),
      UNIQUE(tenant_id, email)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      submitted_by_user_id TEXT,
      submitted_by_name TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS forum_posts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      author_user_id TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS forum_replies (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      post_id TEXT NOT NULL,
      author_user_id TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS knowledge_sources (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      location TEXT NOT NULL,
      status TEXT NOT NULL,
      last_synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS source_snapshots (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      content_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sso_providers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      client_id TEXT,
      client_secret TEXT,
      issuer_url TEXT,
      redirect_uri TEXT,
      scopes_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(tenant_id, provider)
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      actor_user_id TEXT,
      actor_role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS disciplinary_actions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL,
      target_user_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  runMigrations();
  seedDefaultTenant();
  seedDefaultSsoProviders();
}

function ensureColumn(tableName, columnName, columnSql) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some(col => col.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`);
}

function runMigrations() {
  ensureColumn('sso_providers', 'client_secret', 'client_secret TEXT');
  ensureColumn('users', 'user_type', "user_type TEXT NOT NULL DEFAULT 'associate'");
}

function seedDefaultTenant() {
  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get('tenant_default');
  if (!tenant) {
    const cfg = {
      orgName: '',
      hrEmail: '',
      portalUrl: '',
      aiName: 'Bloomie',
      language: 'en-IN',
      hrmsType: '',
      setupCompleted: false,
      tenantBranding: { logoText: 'Bloomie', accentColor: '#FFD101' }
    };
    const securityCfg = {
      dataResidency: 'IN',
      encryptionPolicy: 'AES-256 at rest planned, TLS in deployment',
      allowedDomains: [],
      backupVersioning: true,
      requireSso: false
    };
    db.prepare(`
      INSERT INTO tenants (id, tenant_code, name, status, plan, primary_domain, branding_json, security_json, config_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'tenant_default',
      'DEFAULT',
      'Default Tenant',
      'active',
      'enterprise',
      '',
      json({ theme: 'bloomie-enterprise', accentColor: '#FFD101', supportEmail: '' }),
      json(securityCfg),
      json(cfg),
      nowIso(),
      nowIso()
    );
  }
  const master = db.prepare('SELECT * FROM users WHERE tenant_id = ? AND emp_id = ?').get('tenant_default', 'SYS-000');
  if (!master) {
    const salt = genSalt();
    db.prepare(`
      INSERT INTO users (id, tenant_id, emp_id, name, email, dept, property, role, user_type, status, password_salt, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'user_master',
      'tenant_default',
      'SYS-000',
      'Master Admin',
      'master@bloomie.local',
      'Founder Office',
      '',
      'master',
      'manager',
      'active',
      salt,
      hashPassword(DEFAULT_MASTER_PASS, salt),
      nowIso(),
      nowIso()
    );
  } else if (master.user_type !== 'manager') {
    db.prepare('UPDATE users SET user_type = ?, updated_at = ? WHERE id = ?').run('manager', nowIso(), master.id);
  }
}

function seedDefaultSsoProviders() {
  const tenantIds = db.prepare('SELECT id FROM tenants').all();
  for (const tenant of tenantIds) {
    for (const provider of ['google', 'microsoft']) {
      const existing = db.prepare('SELECT id FROM sso_providers WHERE tenant_id = ? AND provider = ?').get(tenant.id, provider);
      if (existing) continue;
      db.prepare(`
        INSERT INTO sso_providers (id, tenant_id, provider, enabled, client_id, client_secret, issuer_url, redirect_uri, scopes_json, created_at, updated_at)
        VALUES (?, ?, ?, 0, '', '', '', '', ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        tenant.id,
        provider,
        json(provider === 'google' ? ['openid', 'email', 'profile'] : ['openid', 'email', 'profile', 'offline_access']),
        nowIso(),
        nowIso()
      );
    }
  }
}

function logAudit({ tenantId = null, actorUserId = null, actorRole = null, action, entityType = null, entityId = null, details = {} }) {
  db.prepare(`
    INSERT INTO audit_logs (id, tenant_id, actor_user_id, actor_role, action, entity_type, entity_id, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    tenantId,
    actorUserId,
    actorRole,
    action,
    entityType,
    entityId,
    json(details),
    nowIso()
  );
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    empId: row.emp_id,
    name: row.name,
    email: row.email,
    dept: row.dept,
    property: row.property,
    role: row.role,
    userType: row.user_type || 'associate',
    status: row.status
  };
}

function getTenantConfig(tenantId) {
  const row = db.prepare('SELECT config_json FROM tenants WHERE id = ?').get(tenantId);
  return row ? parseJsonSafe(row.config_json, {}) : {};
}

function getTenantRowByCode(tenantCode) {
  return db.prepare('SELECT * FROM tenants WHERE tenant_code = ?').get(cleanText(tenantCode, 32).toUpperCase());
}

function getTenantBranding(tenantId) {
  const row = db.prepare('SELECT branding_json FROM tenants WHERE id = ?').get(tenantId);
  return row ? parseJsonSafe(row.branding_json, {}) : {};
}

function getTenantSecurity(tenantId) {
  const row = db.prepare('SELECT security_json FROM tenants WHERE id = ?').get(tenantId);
  return row ? parseJsonSafe(row.security_json, {}) : {};
}

function publicTenant(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.tenant_code,
    name: row.name,
    status: row.status,
    plan: row.plan,
    primaryDomain: row.primary_domain,
    branding: parseJsonSafe(row.branding_json, {}),
    security: parseJsonSafe(row.security_json, {}),
    config: parseJsonSafe(row.config_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function resolveAdminTargetTenant(auth, body = {}) {
  const requestedTenantCode = cleanText(body.tenantCode, 32).toUpperCase();
  if (requestedTenantCode && auth.user.role === 'master') {
    const tenant = getTenantRowByCode(requestedTenantCode);
    if (tenant) return tenant;
  }
  return db.prepare('SELECT * FROM tenants WHERE id = ?').get(auth.user.tenantId);
}

function patchTenantConfig(tenantId, patch) {
  const current = getTenantConfig(tenantId);
  const next = { ...current, ...patch };
  db.prepare('UPDATE tenants SET config_json = ?, updated_at = ? WHERE id = ?').run(json(next), nowIso(), tenantId);
  return next;
}

function patchTenantRow(tenantId, patch) {
  const current = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
  if (!current) return null;
  const next = {
    name: cleanText(patch.name ?? current.name, 120),
    status: ['active', 'suspended', 'draft'].includes(patch.status) ? patch.status : current.status,
    plan: cleanText(patch.plan ?? current.plan, 40) || current.plan,
    primaryDomain: cleanText(patch.primaryDomain ?? current.primary_domain, 120),
    branding: { ...parseJsonSafe(current.branding_json, {}), ...(patch.branding || {}) },
    security: { ...parseJsonSafe(current.security_json, {}), ...(patch.security || {}) },
    config: { ...parseJsonSafe(current.config_json, {}), ...(patch.config || {}) }
  };
  db.prepare(`
    UPDATE tenants
    SET name = ?, status = ?, plan = ?, primary_domain = ?, branding_json = ?, security_json = ?, config_json = ?, updated_at = ?
    WHERE id = ?
  `).run(next.name, next.status, next.plan, next.primaryDomain, json(next.branding), json(next.security), json(next.config), nowIso(), tenantId);
  return publicTenant(db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId));
}

function getForumState(tenantId) {
  const posts = db.prepare('SELECT author_user_id, payload_json FROM forum_posts WHERE tenant_id = ? ORDER BY created_at DESC').all(tenantId).map(r => ({
    authorUserId: r.author_user_id || '',
    ...parseJsonSafe(r.payload_json, {})
  }));
  const replies = db.prepare('SELECT author_user_id, payload_json FROM forum_replies WHERE tenant_id = ? ORDER BY created_at ASC').all(tenantId).map(r => ({
    authorUserId: r.author_user_id || '',
    ...parseJsonSafe(r.payload_json, {})
  }));
  return { posts, replies };
}

function getTicketsState(tenantId) {
  return db.prepare('SELECT submitted_by_user_id, payload_json FROM tickets WHERE tenant_id = ? ORDER BY created_at DESC').all(tenantId).map(r => ({
    submittedByUserId: r.submitted_by_user_id || '',
    ...parseJsonSafe(r.payload_json, {})
  }));
}

function getUsersState(tenantId) {
  return db.prepare('SELECT * FROM users WHERE tenant_id = ? ORDER BY created_at ASC').all(tenantId).map(publicUser);
}

function getNotificationsState(tenantId, userId) {
  return db.prepare('SELECT payload_json FROM notifications WHERE tenant_id = ? AND user_id = ? ORDER BY created_at DESC').all(tenantId, userId).map(r => parseJsonSafe(r.payload_json, {}));
}

function getDisciplinaryActionsForUser(tenantId, userId) {
  return db.prepare('SELECT payload_json FROM disciplinary_actions WHERE tenant_id = ? AND target_user_id = ? ORDER BY created_at DESC').all(tenantId, userId).map(r => parseJsonSafe(r.payload_json, {}));
}

function getDisciplinaryActionsForManagerView(tenantId, userId, isFounderAdmin) {
  const rows = isFounderAdmin
    ? db.prepare('SELECT payload_json FROM disciplinary_actions WHERE tenant_id = ? ORDER BY created_at DESC').all(tenantId)
    : db.prepare('SELECT payload_json FROM disciplinary_actions WHERE tenant_id = ? AND created_by_user_id = ? ORDER BY created_at DESC').all(tenantId, userId);
  return rows.map(r => parseJsonSafe(r.payload_json, {}));
}

function getAssignableUsers(tenantId) {
  return db.prepare("SELECT * FROM users WHERE tenant_id = ? AND status = 'active' AND role != 'master' ORDER BY name ASC").all(tenantId).map(publicUser);
}

function isManagerLike(user) {
  return !!(user && (user.role === 'master' || user.role === 'admin' || user.userType === 'manager'));
}

function addNotificationRecord({ tenantId, userId, title, desc, type = 'info', relatedType = '', relatedId = '', meta = null }) {
  const createdAt = nowIso();
  const payload = {
    id: crypto.randomUUID(),
    title: cleanText(title, 180),
    desc: cleanText(desc, 500),
    type: cleanText(type, 30) || 'info',
    relatedType: cleanText(relatedType, 40),
    relatedId: cleanText(relatedId, 80),
    meta: meta && typeof meta === 'object' ? meta : undefined,
    read: false,
    createdAt
  };
  db.prepare(`
    INSERT INTO notifications (id, tenant_id, user_id, payload_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(payload.id, tenantId, userId, json(payload), createdAt, createdAt);
  return payload;
}

function getKnowledgeSources(tenantId) {
  return db.prepare('SELECT * FROM knowledge_sources WHERE tenant_id = ? ORDER BY created_at DESC').all(tenantId).map(r => ({
    id: r.id,
    type: r.type,
    title: r.title,
    location: r.location,
    status: r.status,
    lastSyncedAt: r.last_synced_at
  }));
}

function getSsoProviders(tenantId) {
  return db.prepare('SELECT * FROM sso_providers WHERE tenant_id = ? ORDER BY provider ASC').all(tenantId).map(row => ({
    provider: row.provider,
    enabled: !!row.enabled,
    configured: isSsoProviderConfigured(row),
    clientId: row.client_id,
    hasClientSecret: !!row.client_secret,
    issuerUrl: row.issuer_url,
    redirectUri: row.redirect_uri,
    scopes: parseJsonSafe(row.scopes_json, [])
  }));
}

function resolveTenant(req, body = {}, searchParams = null) {
  const candidateCode = cleanText(
    body.tenantCode ||
    req.headers['x-tenant-code'] ||
    (searchParams && searchParams.get('tenant')) ||
    'DEFAULT',
    32
  ).toUpperCase();
  let tenant = getTenantRowByCode(candidateCode);
  if (tenant) return tenant;
  const host = cleanText(String(req.headers.host || '').split(':')[0], 120).toLowerCase();
  if (host) {
    tenant = db.prepare('SELECT * FROM tenants WHERE lower(primary_domain) = ?').get(host);
    if (tenant) return tenant;
  }
  return null;
}

function createTenant({ code, name, plan = 'enterprise', primaryDomain = '' }) {
  const tenantCode = cleanText(code, 32).toUpperCase();
  const tenantId = `tenant_${tenantCode.toLowerCase()}`;
  const createdAt = nowIso();
  const cfg = {
    orgName: cleanText(name, 120),
    hrEmail: '',
    portalUrl: '',
    aiName: 'Bloomie',
    language: 'en-IN',
    hrmsType: '',
    setupCompleted: false,
    tenantBranding: { logoText: cleanText(name, 120), accentColor: '#FFD101' }
  };
  const branding = { theme: 'bloomie-enterprise', accentColor: '#FFD101', supportEmail: '' };
  const security = { dataResidency: 'IN', encryptionPolicy: 'AES-256 at rest planned, TLS in deployment', allowedDomains: [], backupVersioning: true, requireSso: false };
  db.prepare(`
    INSERT INTO tenants (id, tenant_code, name, status, plan, primary_domain, branding_json, security_json, config_json, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)
  `).run(tenantId, tenantCode, cleanText(name, 120), cleanText(plan, 40) || 'enterprise', cleanText(primaryDomain, 120), json(branding), json(security), json(cfg), createdAt, createdAt);
  seedDefaultSsoProviders();
  return publicTenant(db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId));
}

function createTenantAdmin({ tenantId, name, email, empId, password, dept = 'Admin Office', property = '' }) {
  const salt = genSalt();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO users (id, tenant_id, emp_id, name, email, dept, property, role, user_type, status, password_salt, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'admin', 'manager', 'active', ?, ?, ?, ?)
  `).run(
    id,
    tenantId,
    cleanText(empId, 40),
    cleanText(name, 80),
    cleanText(email, 120).toLowerCase(),
    cleanText(dept, 60),
    cleanText(property, 80),
    salt,
    hashPassword(password, salt),
    nowIso(),
    nowIso()
  );
  return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const input = String(text || '');
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];
    if (ch === '"' && inQuotes && next === '"') {
      field += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(field);
      if (row.some(cell => cell !== '')) rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += ch;
  }
  row.push(field);
  if (row.some(cell => cell !== '')) rows.push(row);
  return rows;
}

function normalizeGoogleSheetUrl(url) {
  const value = cleanText(url, 2000);
  if (!value) return '';
  if (value.includes('/export?format=csv')) return value;
  const match = value.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) return value;
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
}

async function syncGoogleSheetSource({ tenantId, url, title }) {
  const location = normalizeGoogleSheetUrl(url);
  const response = await fetch(location);
  if (!response.ok) throw new Error(`Sheet fetch failed with ${response.status}`);
  const csvText = await response.text();
  const rows = parseCsv(csvText);
  const headers = rows[0] || [];
  const records = rows.slice(1).map(cells => {
    const item = {};
    headers.forEach((header, idx) => {
      const key = cleanText(header || `column_${idx + 1}`, 80) || `column_${idx + 1}`;
      item[key] = cleanText(cells[idx] || '', 2000);
    });
    return item;
  }).filter(entry => Object.values(entry).some(Boolean));
  const sourceId = crypto.randomUUID();
  const syncedAt = nowIso();
  db.prepare(`
    INSERT INTO knowledge_sources (id, tenant_id, type, title, location, status, last_synced_at, created_at, updated_at)
    VALUES (?, ?, 'google_sheet', ?, ?, 'synced', ?, ?, ?)
  `).run(sourceId, tenantId, cleanText(title || 'Google Sheet Source', 120), location, syncedAt, syncedAt, syncedAt);
  db.prepare(`
    INSERT INTO source_snapshots (id, tenant_id, source_id, row_count, content_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), tenantId, sourceId, records.length, json(records.slice(0, 500)), syncedAt);
  return { sourceId, rowCount: records.length, headers, preview: records.slice(0, 5), syncedAt, location };
}

async function syncExistingGoogleSheetSource(sourceRow) {
  const syncedAt = nowIso();
  const response = await fetch(normalizeGoogleSheetUrl(sourceRow.location));
  if (!response.ok) throw new Error(`Sheet fetch failed with ${response.status}`);
  const csvText = await response.text();
  const rows = parseCsv(csvText);
  const headers = rows[0] || [];
  const records = rows.slice(1).map(cells => {
    const item = {};
    headers.forEach((header, idx) => {
      const key = cleanText(header || `column_${idx + 1}`, 80) || `column_${idx + 1}`;
      item[key] = cleanText(cells[idx] || '', 2000);
    });
    return item;
  }).filter(entry => Object.values(entry).some(Boolean));
  db.prepare(`
    UPDATE knowledge_sources
    SET status = 'synced', last_synced_at = ?, updated_at = ?
    WHERE id = ? AND tenant_id = ?
  `).run(syncedAt, syncedAt, sourceRow.id, sourceRow.tenant_id);
  db.prepare(`
    INSERT INTO source_snapshots (id, tenant_id, source_id, row_count, content_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), sourceRow.tenant_id, sourceRow.id, records.length, json(records.slice(0, 500)), syncedAt);
  return { rowCount: records.length, syncedAt };
}

function buildBackupSnapshot() {
  const tables = ['tenants', 'users', 'sessions', 'tickets', 'forum_posts', 'forum_replies', 'knowledge_sources', 'source_snapshots', 'sso_providers', 'audit_logs', 'disciplinary_actions', 'notifications'];
  const snapshot = { version: 1, createdAt: nowIso(), tables: {} };
  for (const table of tables) {
    snapshot.tables[table] = db.prepare(`SELECT * FROM ${table}`).all();
  }
  return snapshot;
}

function writeBackupSnapshot(reason = 'manual') {
  const snapshot = buildBackupSnapshot();
  const fileName = `bloomie-backup-${reason}-${snapshot.createdAt.replace(/[:.]/g, '-')}.json`;
  const fullPath = path.join(BACKUP_DIR, fileName);
  fs.writeFileSync(fullPath, JSON.stringify(snapshot, null, 2));
  metrics.lastBackupAt = snapshot.createdAt;
  appendLog('app.log', `[backup] ${fileName}`);
  return { fileName, fullPath, createdAt: snapshot.createdAt };
}

function restoreBackupSnapshot(snapshot) {
  const data = snapshot && snapshot.tables ? snapshot : null;
  if (!data) throw new Error('Invalid backup snapshot');
  db.exec('BEGIN');
  try {
    const tables = ['notifications', 'disciplinary_actions', 'sessions', 'forum_replies', 'forum_posts', 'tickets', 'source_snapshots', 'knowledge_sources', 'sso_providers', 'audit_logs', 'users', 'tenants'];
    for (const table of tables) db.exec(`DELETE FROM ${table}`);
    for (const tenant of data.tables.tenants || []) {
      db.prepare(`INSERT INTO tenants (id, tenant_code, name, status, plan, primary_domain, branding_json, security_json, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(tenant.id, tenant.tenant_code, tenant.name, tenant.status, tenant.plan, tenant.primary_domain, tenant.branding_json, tenant.security_json, tenant.config_json, tenant.created_at, tenant.updated_at);
    }
    for (const user of data.tables.users || []) {
      db.prepare(`INSERT INTO users (id, tenant_id, emp_id, name, email, dept, property, role, user_type, status, password_salt, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(user.id, user.tenant_id, user.emp_id, user.name, user.email, user.dept, user.property, user.role, user.user_type || 'associate', user.status, user.password_salt, user.password_hash, user.created_at, user.updated_at);
    }
    for (const session of data.tables.sessions || []) {
      db.prepare(`INSERT INTO sessions (id, tenant_id, user_id, token_hash, expires_at, revoked_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(session.id, session.tenant_id, session.user_id, session.token_hash, session.expires_at, session.revoked_at, session.created_at);
    }
    for (const ticket of data.tables.tickets || []) {
      db.prepare(`INSERT INTO tickets (id, tenant_id, submitted_by_user_id, submitted_by_name, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(ticket.id, ticket.tenant_id, ticket.submitted_by_user_id, ticket.submitted_by_name, ticket.payload_json, ticket.created_at, ticket.updated_at);
    }
    for (const post of data.tables.forum_posts || []) {
      db.prepare(`INSERT INTO forum_posts (id, tenant_id, author_user_id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(post.id, post.tenant_id, post.author_user_id, post.payload_json, post.created_at, post.updated_at);
    }
    for (const reply of data.tables.forum_replies || []) {
      db.prepare(`INSERT INTO forum_replies (id, tenant_id, post_id, author_user_id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(reply.id, reply.tenant_id, reply.post_id, reply.author_user_id, reply.payload_json, reply.created_at, reply.updated_at);
    }
    for (const source of data.tables.knowledge_sources || []) {
      db.prepare(`INSERT INTO knowledge_sources (id, tenant_id, type, title, location, status, last_synced_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(source.id, source.tenant_id, source.type, source.title, source.location, source.status, source.last_synced_at, source.created_at, source.updated_at);
    }
    for (const snap of data.tables.source_snapshots || []) {
      db.prepare(`INSERT INTO source_snapshots (id, tenant_id, source_id, row_count, content_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(snap.id, snap.tenant_id, snap.source_id, snap.row_count, snap.content_json, snap.created_at);
    }
    for (const provider of data.tables.sso_providers || []) {
      db.prepare(`INSERT INTO sso_providers (id, tenant_id, provider, enabled, client_id, client_secret, issuer_url, redirect_uri, scopes_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(provider.id, provider.tenant_id, provider.provider, provider.enabled, provider.client_id, provider.client_secret || '', provider.issuer_url, provider.redirect_uri, provider.scopes_json, provider.created_at, provider.updated_at);
    }
    for (const log of data.tables.audit_logs || []) {
      db.prepare(`INSERT INTO audit_logs (id, tenant_id, actor_user_id, actor_role, action, entity_type, entity_id, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(log.id, log.tenant_id, log.actor_user_id, log.actor_role, log.action, log.entity_type, log.entity_id, log.details_json, log.created_at);
    }
    for (const action of data.tables.disciplinary_actions || []) {
      db.prepare(`INSERT INTO disciplinary_actions (id, tenant_id, created_by_user_id, target_user_id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(action.id, action.tenant_id, action.created_by_user_id, action.target_user_id, action.payload_json, action.created_at, action.updated_at);
    }
    for (const notification of data.tables.notifications || []) {
      db.prepare(`INSERT INTO notifications (id, tenant_id, user_id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(notification.id, notification.tenant_id, notification.user_id, notification.payload_json, notification.created_at, notification.updated_at);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

async function runSheetSyncWorker() {
  metrics.lastSyncRunAt = nowIso();
  const sources = db.prepare(`SELECT * FROM knowledge_sources WHERE type = 'google_sheet'`).all();
  for (const source of sources) {
    try {
      await syncExistingGoogleSheetSource(source);
    } catch (err) {
      db.prepare(`UPDATE knowledge_sources SET status = 'sync-error', updated_at = ? WHERE id = ?`).run(nowIso(), source.id);
      recordError(err, `sheet-sync:${source.id}`);
    }
  }
}

function getReportSummary(tenantId) {
  const tickets = getTicketsState(tenantId);
  return {
    totalTickets: tickets.length,
    open: tickets.filter(t => t.status === 'open').length,
    inProgress: tickets.filter(t => t.status === 'in-progress').length,
    resolved: tickets.filter(t => t.status === 'resolved').length,
    escalated: tickets.filter(t => t.status === 'escalated').length,
    knowledgeSources: getKnowledgeSources(tenantId).length
  };
}

function authenticate(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  const parsed = verifySessionToken(token);
  if (!parsed) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND revoked_at IS NULL').get(parsed.sessionId);
  if (!session) return null;
  if (session.expires_at < Date.now()) return null;
  if (session.token_hash !== hashText(token)) return null;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(parsed.userId);
  if (!user || user.status !== 'active') return null;
  return { token, session, user: publicUser(user) };
}

function createOauthState({ tenantId, provider }) {
  const payload = json({ tenantId, provider, issuedAt: Date.now() });
  const encoded = Buffer.from(payload, 'utf8').toString('base64url');
  return `${encoded}.${signValue(encoded)}`;
}

function verifyOauthState(state) {
  const [encoded, sig] = String(state || '').split('.');
  if (!encoded || !sig) return null;
  if (signValue(encoded) !== sig) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!parsed || !parsed.tenantId || !parsed.provider) return null;
    if (Date.now() - Number(parsed.issuedAt || 0) > 10 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getProviderDefaults(provider, row = {}) {
  if (provider === 'google') {
    return {
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
      issuerUrl: row.issuer_url || 'https://accounts.google.com'
    };
  }
  const issuerBase = cleanText(row.issuer_url || 'https://login.microsoftonline.com/common/oauth2/v2.0', 300).replace(/\/$/, '');
  return {
    authUrl: `${issuerBase}/authorize`,
    tokenUrl: `${issuerBase}/token`,
    userInfoUrl: 'https://graph.microsoft.com/oidc/userinfo',
    issuerUrl: issuerBase
  };
}

async function exchangeOauthCode({ provider, row, code }) {
  const defaults = getProviderDefaults(provider, row);
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: row.client_id,
    client_secret: row.client_secret || '',
    redirect_uri: row.redirect_uri
  });
  const tokenResp = await fetch(defaults.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  if (!tokenResp.ok) throw new Error(`${provider} token exchange failed with ${tokenResp.status}`);
  const tokenData = await tokenResp.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) throw new Error(`${provider} access token missing`);
  const userResp = await fetch(defaults.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!userResp.ok) throw new Error(`${provider} user info fetch failed with ${userResp.status}`);
  const profile = await userResp.json();
  return {
    email: cleanText(profile.email || profile.preferred_username, 120).toLowerCase(),
    name: cleanText(profile.name || profile.given_name || 'SSO User', 80),
    providerSubject: cleanText(profile.sub || profile.id || '', 120)
  };
}

function upsertSsoUser({ tenantId, email, name }) {
  let row = db.prepare('SELECT * FROM users WHERE tenant_id = ? AND lower(email) = ?').get(tenantId, String(email || '').toLowerCase());
  if (row) return row;
  const empId = cleanId(`SSO-${Date.now()}`, 'SSO');
  const salt = genSalt();
  db.prepare(`
    INSERT INTO users (id, tenant_id, emp_id, name, email, dept, property, role, user_type, status, password_salt, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'user', 'associate', 'active', ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    tenantId,
    empId,
    name,
    email,
    'SSO',
    '',
    salt,
    hashPassword(crypto.randomUUID(), salt),
    nowIso(),
    nowIso()
  );
  return db.prepare('SELECT * FROM users WHERE tenant_id = ? AND lower(email) = ?').get(tenantId, String(email || '').toLowerCase());
}

function requireAuth(req, res) {
  const auth = authenticate(req);
  if (!auth) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return null;
  }
  return auth;
}

function requireRole(auth, roles, res) {
  if (!roles.includes(auth.user.role)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return false;
  }
  return true;
}

async function handleApi(req, res, urlObj) {
  const { pathname, searchParams } = urlObj;
  const isAuthRoute = pathname.startsWith('/api/auth/');
  const isWriteRoute = ['POST', 'PATCH', 'DELETE'].includes(req.method);
  if (isAuthRoute && !checkRateLimit(req, res, 'auth', AUTH_RATE_LIMIT_MAX, AUTH_RATE_LIMIT_WINDOW_MS)) return;
  if (!isAuthRoute && isWriteRoute && !checkRateLimit(req, res, 'api', API_RATE_LIMIT_MAX, API_RATE_LIMIT_WINDOW_MS)) return;

  if (req.method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, { ok: true, service: 'bloomie-backend', db: DB_PATH, time: nowIso() });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/metrics') {
    if (!isLocalRequest(req)) {
      const auth = requireAuth(req, res);
      if (!auth) return;
      if (!requireRole(auth, ['master'], res)) return;
    }
    sendJson(res, 200, {
      uptimeSeconds: Math.round((Date.now() - metrics.startedAt) / 1000),
      requestsTotal: metrics.requestsTotal,
      requestsByRoute: metrics.requestsByRoute,
      statusByCode: metrics.statusByCode,
      rateLimitBlocks: metrics.rateLimitBlocks,
      authFailures: metrics.authFailures,
      errors: metrics.errors,
      lastError: metrics.lastError,
      lastBackupAt: metrics.lastBackupAt,
      lastSyncRunAt: metrics.lastSyncRunAt
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/ops/status') {
    if (!isLocalRequest(req)) {
      const auth = requireAuth(req, res);
      if (!auth) return;
      if (!requireRole(auth, ['master'], res)) return;
    }
    const backups = fs.readdirSync(BACKUP_DIR).filter(name => name.endsWith('.json')).length;
    sendJson(res, 200, {
      service: 'bloomie-backend',
      time: nowIso(),
      uptimeSeconds: Math.round((Date.now() - metrics.startedAt) / 1000),
      dbPath: DB_PATH,
      logsPath: LOG_DIR,
      backupsAvailable: backups,
      lastBackupAt: metrics.lastBackupAt,
      lastSyncRunAt: metrics.lastSyncRunAt,
      rateLimitBlocks: metrics.rateLimitBlocks,
      errors: metrics.errors
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/auth/register') {
    const raw = await readBody(req);
    const body = parseJsonSafe(raw, {});
    const tenant = resolveTenant(req, body, searchParams);
    if (!tenant) {
      metrics.authFailures += 1;
      return sendJson(res, 404, { error: 'Tenant not found' });
    }
    const empId = cleanText(body.empId, 40);
    const email = cleanText(body.email, 120).toLowerCase();
    const name = cleanText(body.name, 80);
    const dept = cleanText(body.dept, 60);
    const property = cleanText(body.property, 80);
    const userType = body.userType === 'manager' ? 'manager' : 'associate';
    const password = String(body.password || '');
    if (!empId || !email || !name || !dept || password.length < 6) return sendJson(res, 400, { error: 'Invalid registration payload' });
    const exists = db.prepare('SELECT id FROM users WHERE tenant_id = ? AND (emp_id = ? OR email = ?)').get(tenant.id, empId, email);
    if (exists) return sendJson(res, 409, { error: 'User already exists' });
    const salt = genSalt();
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO users (id, tenant_id, emp_id, name, email, dept, property, role, user_type, status, password_salt, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, tenant.id, empId, name, email, dept, property, 'user', userType, 'active', salt, hashPassword(password, salt), nowIso(), nowIso());
    logAudit({ tenantId: tenant.id, actorUserId: id, actorRole: 'user', action: 'user.registered', entityType: 'user', entityId: id, details: { empId, email, userType } });
    sendJson(res, 201, { ok: true });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const raw = await readBody(req);
    const body = parseJsonSafe(raw, {});
    const tenant = resolveTenant(req, body, searchParams);
    if (!tenant) {
      metrics.authFailures += 1;
      return sendJson(res, 404, { error: 'Tenant not found' });
    }
    const identifier = cleanText(body.identifier, 120).toLowerCase();
    const password = String(body.password || '');
    const identifierAlias = identifier === 'master' ? 'sys-000' : identifier;
    const row = db.prepare(`
      SELECT * FROM users
      WHERE tenant_id = ?
        AND (lower(emp_id) = ? OR lower(email) = ? OR lower(name) = ? OR (? = 'master' AND role = 'master'))
      LIMIT 1
    `).get(tenant.id, identifierAlias, identifier, identifier, identifier);
    if (!row || row.status !== 'active') {
      metrics.authFailures += 1;
      logAudit({ tenantId: tenant.id, actorRole: 'anonymous', action: 'auth.login.failed', entityType: 'user', entityId: identifier, details: { identifier } });
      return sendJson(res, 401, { error: 'Invalid credentials' });
    }
    const valid = hashPassword(password, row.password_salt) === row.password_hash;
    if (!valid) {
      metrics.authFailures += 1;
      logAudit({ tenantId: tenant.id, actorUserId: row.id, actorRole: row.role, action: 'auth.login.failed', entityType: 'user', entityId: row.id, details: { identifier } });
      return sendJson(res, 401, { error: 'Invalid credentials' });
    }
    const sessionId = crypto.randomUUID();
    const expiresAt = Date.now() + SESSION_TTL_MS;
    const token = createSessionToken(sessionId, row.id, tenant.id, expiresAt);
    db.prepare(`
      INSERT INTO sessions (id, tenant_id, user_id, token_hash, expires_at, revoked_at, created_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?)
    `).run(sessionId, tenant.id, row.id, hashText(token), expiresAt, nowIso());
    logAudit({ tenantId: tenant.id, actorUserId: row.id, actorRole: row.role, action: 'auth.login', entityType: 'session', entityId: sessionId });
    sendJson(res, 200, {
      token,
      user: publicUser(row),
      tenant: { id: tenant.id, code: tenant.tenant_code, name: tenant.name }
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').run(nowIso(), auth.session.id);
    logAudit({ tenantId: auth.user.tenantId, actorUserId: auth.user.id, actorRole: auth.user.role, action: 'auth.logout', entityType: 'session', entityId: auth.session.id });
    sendJson(res, 200, { ok: true });
    return;
  }

  const ssoStartMatch = pathname.match(/^\/api\/auth\/(google|microsoft)\/start$/);
  if (req.method === 'GET' && ssoStartMatch) {
    const provider = ssoStartMatch[1];
    const tenant = resolveTenant(req, {}, searchParams);
    if (!tenant) return sendJson(res, 404, { error: 'Tenant not found' });
    const row = db.prepare('SELECT * FROM sso_providers WHERE tenant_id = ? AND provider = ?').get(tenant.id, provider);
    if (!isSsoProviderConfigured(row)) {
      return sendJson(res, 400, { error: `${provider} SSO is not fully configured for this tenant` });
    }
    const defaults = getProviderDefaults(provider, row);
    const authUrl = new URL(defaults.authUrl);
    authUrl.searchParams.set('client_id', row.client_id);
    authUrl.searchParams.set('redirect_uri', row.redirect_uri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', parseJsonSafe(row.scopes_json, []).join(' '));
    authUrl.searchParams.set('state', createOauthState({ tenantId: tenant.id, provider }));
    authUrl.searchParams.set('prompt', 'select_account');
    res.writeHead(302, { Location: authUrl.toString() });
    res.end();
    return;
  }

  const ssoCallbackMatch = pathname.match(/^\/api\/auth\/(google|microsoft)\/callback$/);
  if (req.method === 'GET' && ssoCallbackMatch) {
    const provider = ssoCallbackMatch[1];
    const code = cleanText(searchParams.get('code'), 2000);
    const state = verifyOauthState(searchParams.get('state'));
    if (!code || !state || state.provider !== provider) return sendText(res, 400, 'Invalid SSO callback');
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(state.tenantId);
    if (!tenant) return sendText(res, 404, 'Tenant not found');
    const row = db.prepare('SELECT * FROM sso_providers WHERE tenant_id = ? AND provider = ?').get(tenant.id, provider);
    if (!row || !row.enabled) return sendText(res, 400, 'SSO provider not enabled');
    try {
      const profile = await exchangeOauthCode({ provider, row, code });
      if (!profile.email) throw new Error('No email returned from provider');
      const security = getTenantSecurity(tenant.id);
      const allowedDomains = Array.isArray(security.allowedDomains) ? security.allowedDomains : [];
      if (allowedDomains.length) {
        const domain = profile.email.split('@')[1] || '';
        if (!allowedDomains.map(item => String(item).toLowerCase()).includes(domain.toLowerCase())) {
          throw new Error('Email domain is not allowed for this tenant');
        }
      }
      const user = upsertSsoUser({ tenantId: tenant.id, email: profile.email, name: profile.name });
      const sessionId = crypto.randomUUID();
      const expiresAt = Date.now() + SESSION_TTL_MS;
      const token = createSessionToken(sessionId, user.id, tenant.id, expiresAt);
      db.prepare(`INSERT INTO sessions (id, tenant_id, user_id, token_hash, expires_at, revoked_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)`)
        .run(sessionId, tenant.id, user.id, hashText(token), expiresAt, nowIso());
      logAudit({ tenantId: tenant.id, actorUserId: user.id, actorRole: user.role, action: `auth.${provider}.login`, entityType: 'session', entityId: sessionId, details: { email: profile.email } });
      const redirectTarget = new URL(APP_BASE_URL);
      redirectTarget.searchParams.set('ssoToken', token);
      redirectTarget.searchParams.set('tenantCode', tenant.tenant_code);
      res.writeHead(302, { Location: redirectTarget.toString() });
      res.end();
    } catch (err) {
      recordError(err, `oauth-callback:${provider}`);
      sendText(res, 500, `SSO login failed: ${err.message}`);
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/auth/session') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(auth.user.tenantId);
    sendJson(res, 200, { user: auth.user, tenant: publicTenant(tenant) });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/bootstrap') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(auth.user.tenantId);
    sendJson(res, 200, {
      tenant: publicTenant(tenant),
      config: getTenantConfig(auth.user.tenantId),
      tickets: getTicketsState(auth.user.tenantId),
      forum: getForumState(auth.user.tenantId),
      reports: getReportSummary(auth.user.tenantId),
      knowledgeSources: getKnowledgeSources(auth.user.tenantId),
      ssoProviders: getSsoProviders(auth.user.tenantId),
      users: auth.user.role === 'master'
        ? getUsersState(auth.user.tenantId)
        : isManagerLike(auth.user)
          ? getAssignableUsers(auth.user.tenantId)
          : undefined,
      notifications: getNotificationsState(auth.user.tenantId, auth.user.id),
      tasks: getDisciplinaryActionsForUser(auth.user.tenantId, auth.user.id),
      managerActions: isManagerLike(auth.user) ? getDisciplinaryActionsForManagerView(auth.user.tenantId, auth.user.id, auth.user.role === 'master' || auth.user.role === 'admin') : undefined
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/master/tenants') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['master'], res)) return;
    const tenants = db.prepare('SELECT * FROM tenants ORDER BY created_at ASC').all().map(publicTenant);
    sendJson(res, 200, { tenants });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/master/tenants') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['master'], res)) return;
    const raw = await readBody(req);
    const body = parseJsonSafe(raw, {});
    const code = cleanText(body.code, 32).toUpperCase();
    const name = cleanText(body.name, 120);
    const adminName = cleanText(body.adminName, 80);
    const adminEmail = cleanText(body.adminEmail, 120).toLowerCase();
    const adminEmpId = cleanText(body.adminEmpId, 40);
    const adminPassword = String(body.adminPassword || '');
    if (!code || !name || !adminName || !adminEmail || !adminEmpId || adminPassword.length < 8) {
      return sendJson(res, 400, { error: 'Tenant code, name, and seeded admin credentials are required' });
    }
    if (getTenantRowByCode(code)) return sendJson(res, 409, { error: 'Tenant already exists' });
    const tenant = createTenant({ code, name, plan: body.plan, primaryDomain: body.primaryDomain });
    const admin = createTenantAdmin({
      tenantId: tenant.id,
      name: adminName,
      email: adminEmail,
      empId: adminEmpId,
      password: adminPassword,
      dept: body.adminDept || 'Admin Office',
      property: body.adminProperty || ''
    });
    logAudit({ tenantId: tenant.id, actorUserId: auth.user.id, actorRole: auth.user.role, action: 'tenant.created', entityType: 'tenant', entityId: tenant.id, details: { code: tenant.code, seededAdmin: admin.empId } });
    sendJson(res, 201, { tenant, admin });
    return;
  }

  const tenantPatchMatch = pathname.match(/^\/api\/master\/tenants\/([^/]+)$/);
  if (req.method === 'PATCH' && tenantPatchMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['master'], res)) return;
    const tenantCode = decodeURIComponent(tenantPatchMatch[1]).toUpperCase();
    const tenant = getTenantRowByCode(tenantCode);
    if (!tenant) return sendJson(res, 404, { error: 'Tenant not found' });
    const raw = await readBody(req);
    const body = parseJsonSafe(raw, {});
    const next = patchTenantRow(tenant.id, body);
    logAudit({ tenantId: tenant.id, actorUserId: auth.user.id, actorRole: auth.user.role, action: 'tenant.updated', entityType: 'tenant', entityId: tenant.id, details: body });
    sendJson(res, 200, { tenant: next });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/master/audit') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['master'], res)) return;
    const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') || 100)));
    const logs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?').all(limit).map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      actorUserId: row.actor_user_id,
      actorRole: row.actor_role,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      details: parseJsonSafe(row.details_json, {}),
      createdAt: row.created_at
    }));
    sendJson(res, 200, { logs });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/master/backups') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['master'], res)) return;
    const files = fs.readdirSync(BACKUP_DIR).filter(name => name.endsWith('.json')).sort().reverse().map(name => {
      const fullPath = path.join(BACKUP_DIR, name);
      const stat = fs.statSync(fullPath);
      return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
    });
    sendJson(res, 200, { backups: files });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/master/backups/create') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['master'], res)) return;
    const backup = writeBackupSnapshot('manual');
    logAudit({ tenantId: auth.user.tenantId, actorUserId: auth.user.id, actorRole: auth.user.role, action: 'backup.created', entityType: 'backup', entityId: backup.fileName });
    sendJson(res, 201, { backup });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/master/backups/export') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['master'], res)) return;
    sendJson(res, 200, buildBackupSnapshot());
    return;
  }

  if (req.method === 'POST' && pathname === '/api/master/backups/restore') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['master'], res)) return;
    const raw = await readBody(req);
    const body = parseJsonSafe(raw, {});
    restoreBackupSnapshot(body);
    logAudit({ tenantId: auth.user.tenantId, actorUserId: auth.user.id, actorRole: auth.user.role, action: 'backup.restored', entityType: 'backup', entityId: 'restore' });
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/config/patch') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['admin', 'master'], res)) return;
    const raw = await readBody(req);
    const body = parseJsonSafe(raw, {});
    const next = patchTenantConfig(auth.user.tenantId, body || {});
    logAudit({ tenantId: auth.user.tenantId, actorUserId: auth.user.id, actorRole: auth.user.role, action: 'config.patched', entityType: 'tenant_config', entityId: auth.user.tenantId, details: body });
    sendJson(res, 200, { config: next });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/tickets') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    let tickets = getTicketsState(auth.user.tenantId);
    if (!['admin', 'master'].includes(auth.user.role)) {
      tickets = tickets.filter(t => t.submittedByUserId === auth.user.id || (!t.submittedByUserId && t.submittedBy === auth.user.name));
    }
    sendJson(res, 200, { tickets });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/tickets') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const raw = await readBody(req);
    const body = parseJsonSafe(raw, {});
    const ticket = {
      ...body,
      id: cleanId(body.id || `BHG-HD-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`, 'BHG-HD'),
      submittedByUserId: auth.user.id,
      submittedBy: auth.user.name,
      createdAt: body.createdAt || nowIso(),
      updatedAt: nowIso()
    };
    db.prepare(`
      INSERT OR REPLACE INTO tickets (id, tenant_id, submitted_by_user_id, submitted_by_name, payload_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(ticket.id, auth.user.tenantId, auth.user.id, auth.user.name, json(ticket), ticket.createdAt, ticket.updatedAt);
    logAudit({ tenantId: auth.user.tenantId, actorUserId: auth.user.id, actorRole: auth.user.role, action: 'ticket.created', entityType: 'ticket', entityId: ticket.id });
    sendJson(res, 201, { ticket });
    return;
  }

  const ticketDeleteMatch = pathname.match(/^\/api\/tickets\/([^/]+)$/);
  if (req.method === 'DELETE' && ticketDeleteMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['master'], res)) return;
    const ticketId = decodeURIComponent(ticketDeleteMatch[1]);
    const raw = await readBody(req);
    const body = parseJsonSafe(raw, {});
    const targetTenant = resolveAdminTargetTenant(auth, body);
    if (!targetTenant) return sendJson(res, 404, { error: 'Tenant not found' });
    const row = db.prepare('SELECT id FROM tickets WHERE tenant_id = ? AND id = ?').get(targetTenant.id, ticketId);
    if (!row) return sendJson(res, 404, { error: 'Ticket not found' });
    db.prepare('DELETE FROM tickets WHERE tenant_id = ? AND id = ?').run(targetTenant.id, ticketId);
    logAudit({ tenantId: targetTenant.id, actorUserId: auth.user.id, actorRole: auth.user.role, action: 'ticket.deleted', entityType: 'ticket', entityId: ticketId, details: { tenantCode: targetTenant.tenant_code } });
    sendJson(res, 200, { ok: true, id: ticketId });
    return;
  }

  const ticketStatusMatch = pathname.match(/^\/api\/tickets\/([^/]+)\/status$/);
  if (req.method === 'PATCH' && ticketStatusMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['admin', 'master'], res)) return;
    const ticketId = decodeURIComponent(ticketStatusMatch[1]);
    const row = db.prepare('SELECT * FROM tickets WHERE tenant_id = ? AND id = ?').get(auth.user.tenantId, ticketId);
    if (!row) return sendJson(res, 404, { error: 'Ticket not found' });
    const raw = await readBody(req);
    const body = parseJsonSafe(raw, {});
    const ticket = parseJsonSafe(row.payload_json, {});
    ticket.status = cleanText(body.status, 30) || ticket.status;
    ticket.updatedAt = nowIso();
    ticket.timeline = Array.isArray(ticket.timeline) ? ticket.timeline : [];
    ticket.timeline.push({ event: `Status changed to ${ticket.status}`, time: nowIso(), icon: '📍' });
    db.prepare('UPDATE tickets SET payload_json = ?, updated_at = ? WHERE tenant_id = ? AND id = ?').run(json(ticket), ticket.updatedAt, auth.user.tenantId, ticketId);
    logAudit({ tenantId: auth.user.tenantId, actorUserId: auth.user.id, actorRole: auth.user.role, action: 'ticket.status.updated', entityType: 'ticket', entityId: ticketId, details: { status: ticket.status } });
    sendJson(res, 200, { ticket });
    return;
  }

  const ticketRespMatch = pathname.match(/^\/api\/tickets\/([^/]+)\/response$/);
  if (req.method === 'PATCH' && ticketRespMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['admin', 'master'], res)) return;
    const ticketId = decodeURIComponent(ticketRespMatch[1]);
    const row = db.prepare('SELECT * FROM tickets WHERE tenant_id = ? AND id = ?').get(auth.user.tenantId, ticketId);
    if (!row) return sendJson(res, 404, { error: 'Ticket not found' });
    const raw = await readBody(req);
    const body = parseJsonSafe(raw, {});
    const ticket = parseJsonSafe(row.payload_json, {});
    ticket.hrResponse = cleanText(body.hrResponse, 4000);
    ticket.updatedAt = nowIso();
    ticket.timeline = Array.isArray(ticket.timeline) ? ticket.timeline : [];
    ticket.timeline.push({ event: 'HR responded', time: nowIso(), icon: '💬' });
    db.prepare('UPDATE tickets SET payload_json = ?, updated_at = ? WHERE tenant_id = ? AND id = ?').run(json(ticket), ticket.updatedAt, auth.user.tenantId, ticketId);
    logAudit({ tenantId: auth.user.tenantId, actorUserId: auth.user.id, actorRole: auth.user.role, action: 'ticket.response.saved', entityType: 'ticket', entityId: ticketId });
    sendJson(res, 200, { ticket });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/forum') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    sendJson(res, 200, getForumState(auth.user.tenantId));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/forum/posts') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const raw = await readBody(req);
    const body = parseJsonSafe(raw, {});
    const post = {
      ...body,
      id: cleanId(body.id || `FRM-${Date.now()}`, 'FRM'),
      authorUserId: auth.user.id,
      author: auth.user.name,
      role: auth.user.dept || auth.user.role,
      createdAt: body.createdAt || nowIso(),
      lastActivity: nowIso()
    };
    db.prepare(`
      INSERT OR REPLACE INTO forum_posts (id, tenant_id, author_user_id, payload_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(post.id, auth.user.tenantId, auth.user.id, json(post), post.createdAt, post.lastActivity);
    logAudit({ tenantId: auth.user.tenantId, actorUserId: auth.user.id, actorRole: auth.user.role, action: 'forum.post.created', entityType: 'forum_post', entityId: post.id });
    sendJson(res, 201, { post });
    return;
  }

  const forumReplyMatch = pathname.match(/^\/api\/forum\/posts\/([^/]+)\/replies$/);
  if (req.method === 'POST' && forumReplyMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const postId = decodeURIComponent(forumReplyMatch[1]);
    const raw = await readBody(req);
    const body = parseJsonSafe(raw, {});
    const reply = {
      ...body,
      id: cleanId(body.id || `FRMR-${Date.now()}`, 'FRMR'),
      postId,
      authorUserId: auth.user.id,
      author: auth.user.name,
      role: auth.user.dept || auth.user.role,
      createdAt: body.createdAt || nowIso()
    };
    db.prepare(`
      INSERT OR REPLACE INTO forum_replies (id, tenant_id, post_id, author_user_id, payload_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(reply.id, auth.user.tenantId, postId, auth.user.id, json(reply), reply.createdAt, reply.createdAt);
    const postRow = db.prepare('SELECT * FROM forum_posts WHERE tenant_id = ? AND id = ?').get(auth.user.tenantId, postId);
    if (postRow) {
      const post = parseJsonSafe(postRow.payload_json, {});
      post.lastActivity = nowIso();
      db.prepare('UPDATE forum_posts SET payload_json = ?, updated_at = ? WHERE tenant_id = ? AND id = ?').run(json(post), post.lastActivity, auth.user.tenantId, postId);
    }
    logAudit({ tenantId: auth.user.tenantId, actorUserId: auth.user.id, actorRole: auth.user.role, action: 'forum.reply.created', entityType: 'forum_reply', entityId: reply.id, details: { postId } });
    sendJson(res, 201, { reply });
    return;
  }

  const forumUpvoteMatch = pathname.match(/^\/api\/forum\/posts\/([^/]+)\/upvote$/);
  if (req.method === 'POST' && forumUpvoteMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const postId = decodeURIComponent(forumUpvoteMatch[1]);
    const postRow = db.prepare('SELECT * FROM forum_posts WHERE tenant_id = ? AND id = ?').get(auth.user.tenantId, postId);
    if (!postRow) return sendJson(res, 404, { error: 'Post not found' });
    const post = parseJsonSafe(postRow.payload_json, {});
    post.upvotes = Number(post.upvotes || 0) + 1;
    post.lastActivity = nowIso();
    db.prepare('UPDATE forum_posts SET payload_json = ?, updated_at = ? WHERE tenant_id = ? AND id = ?').run(json(post), post.lastActivity, auth.user.tenantId, postId);
    logAudit({ tenantId: auth.user.tenantId, actorUserId: auth.user.id, actorRole: auth.user.role, action: 'forum.post.upvoted', entityType: 'forum_post', entityId: postId });
    sendJson(res, 200, { post });
    return;
  }

  const forumAcceptMatch = pathname.match(/^\/api\/forum\/posts\/([^/]+)\/accept$/);
  if (req.method === 'POST' && forumAcceptMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const postId = decodeURIComponent(forumAcceptMatch[1]);
    const raw = await readBody(req);
    const body = parseJsonSafe(raw, {});
    const postRow = db.prepare('SELECT * FROM forum_posts WHERE tenant_id = ? AND id = ?').get(auth.user.tenantId, postId);
    if (!postRow) return sendJson(res, 404, { error: 'Post not found' });
    const replyId = cleanId(body.replyId, 'FRMR');
    const replyRow = db.prepare('SELECT id FROM forum_replies WHERE tenant_id = ? AND post_id = ? AND id = ?').get(auth.user.tenantId, postId, replyId);
    if (!replyRow) return sendJson(res, 404, { error: 'Reply not found' });
    const post = parseJsonSafe(postRow.payload_json, {});
    const postOwnerId = post.authorUserId || postRow.author_user_id || '';
    if (!(auth.user.role === 'admin' || auth.user.role === 'master' || auth.user.id === postOwnerId)) return sendJson(res, 403, { error: 'Forbidden' });
    post.acceptedReplyId = replyId;
    post.status = 'solved';
    post.lastActivity = nowIso();
    db.prepare('UPDATE forum_posts SET payload_json = ?, updated_at = ? WHERE tenant_id = ? AND id = ?').run(json(post), post.lastActivity, auth.user.tenantId, postId);
    logAudit({ tenantId: auth.user.tenantId, actorUserId: auth.user.id, actorRole: auth.user.role, action: 'forum.reply.accepted', entityType: 'forum_post', entityId: postId, details: { replyId: post.acceptedReplyId } });
    sendJson(res, 200, { post });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/reports/summary') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['admin', 'master'], res)) return;
    sendJson(res, 200, getReportSummary(auth.user.tenantId));
    return;
  }

  if (req.method === 'GET' && pathname === '/api/reports/dashboard') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['admin', 'master'], res)) return;
    const tickets = getTicketsState(auth.user.tenantId);
    const categoryCounts = {};
    const priorityCounts = {};
    const dayCounts = {};
    for (const ticket of tickets) {
      const category = cleanText(ticket.category || 'Uncategorized', 80) || 'Uncategorized';
      const priority = cleanText(ticket.priority || 'Medium', 20) || 'Medium';
      const day = String(ticket.createdAt || nowIso()).slice(0, 10);
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    }
    sendJson(res, 200, {
      summary: getReportSummary(auth.user.tenantId),
      categories: categoryCounts,
      priorities: priorityCounts,
      dailyVolume: dayCounts,
      topOpenTickets: tickets.filter(ticket => ticket.status !== 'resolved').slice(0, 10)
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/admin/users') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['master'], res)) return;
    sendJson(res, 200, { users: getUsersState(auth.user.tenantId) });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/users/directory') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!(isManagerLike(auth.user) || auth.user.role === 'user')) return sendJson(res, 403, { error: 'Forbidden' });
    sendJson(res, 200, { users: getAssignableUsers(auth.user.tenantId) });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/security/sso') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['admin', 'master'], res)) return;
    sendJson(res, 200, { providers: getSsoProviders(auth.user.tenantId), security: getTenantSecurity(auth.user.tenantId) });
    return;
  }

  const ssoProviderMatch = pathname.match(/^\/api\/security\/sso\/([^/]+)$/);
  if (req.method === 'PATCH' && ssoProviderMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['admin', 'master'], res)) return;
    const provider = decodeURIComponent(ssoProviderMatch[1]).toLowerCase();
    if (!['google', 'microsoft'].includes(provider)) return sendJson(res, 400, { error: 'Unsupported provider' });
    const raw = await readBody(req);
    const body = parseJsonSafe(raw, {});
    const clientId = cleanText(body.clientId, 300);
    const clientSecret = cleanText(body.clientSecret, 300);
    const redirectUri = cleanText(body.redirectUri, 300);
    const enabled = !!body.enabled;
    if (enabled && (looksLikePlaceholderSecret(clientId) || looksLikePlaceholderSecret(clientSecret))) {
      return sendJson(res, 400, { error: `Enter a real ${provider} OAuth client ID and client secret before enabling SSO` });
    }
    db.prepare(`
      UPDATE sso_providers
      SET enabled = ?, client_id = ?, client_secret = ?, issuer_url = ?, redirect_uri = ?, scopes_json = ?, updated_at = ?
      WHERE tenant_id = ? AND provider = ?
    `).run(
      enabled ? 1 : 0,
      clientId,
      clientSecret,
      cleanText(body.issuerUrl, 300),
      redirectUri,
      json(Array.isArray(body.scopes) ? body.scopes.map(item => cleanText(item, 120)).filter(Boolean) : []),
      nowIso(),
      auth.user.tenantId,
      provider
    );
    logAudit({ tenantId: auth.user.tenantId, actorUserId: auth.user.id, actorRole: auth.user.role, action: 'sso.provider.updated', entityType: 'sso_provider', entityId: provider, details: body });
    sendJson(res, 200, { providers: getSsoProviders(auth.user.tenantId) });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/security/policy') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['admin', 'master'], res)) return;
    const raw = await readBody(req);
    const body = parseJsonSafe(raw, {});
    const security = patchTenantRow(auth.user.tenantId, { security: body || {} });
    logAudit({ tenantId: auth.user.tenantId, actorUserId: auth.user.id, actorRole: auth.user.role, action: 'security.policy.updated', entityType: 'tenant_security', entityId: auth.user.tenantId, details: body });
    sendJson(res, 200, { security: security ? security.security : getTenantSecurity(auth.user.tenantId) });
    return;
  }

  const userRoleMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/role$/);
  if (req.method === 'PATCH' && userRoleMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['master'], res)) return;
    const empId = decodeURIComponent(userRoleMatch[1]);
    const raw = await readBody(req);
    const body = parseJsonSafe(raw, {});
    const targetTenant = resolveAdminTargetTenant(auth, body);
    if (!targetTenant) return sendJson(res, 404, { error: 'Tenant not found' });
    const role = body.role === 'admin' ? 'admin' : 'user';
    const result = db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE tenant_id = ? AND emp_id = ? AND role != ?').run(role, nowIso(), targetTenant.id, empId, 'master');
    if (!result.changes) return sendJson(res, 404, { error: 'User not found' });
    logAudit({ tenantId: targetTenant.id, actorUserId: auth.user.id, actorRole: auth.user.role, action: 'user.role.updated', entityType: 'user', entityId: empId, details: { role, tenantCode: targetTenant.tenant_code } });
    sendJson(res, 200, { ok: true });
    return;
  }

  const userStatusMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
  if (req.method === 'PATCH' && userStatusMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['master'], res)) return;
    const empId = decodeURIComponent(userStatusMatch[1]);
    const raw = await readBody(req);
    const body = parseJsonSafe(raw, {});
    const targetTenant = resolveAdminTargetTenant(auth, body);
    if (!targetTenant) return sendJson(res, 404, { error: 'Tenant not found' });
    const status = body.status === 'suspended' ? 'suspended' : 'active';
    const result = db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE tenant_id = ? AND emp_id = ? AND role != ?').run(status, nowIso(), targetTenant.id, empId, 'master');
    if (!result.changes) return sendJson(res, 404, { error: 'User not found' });
    logAudit({ tenantId: targetTenant.id, actorUserId: auth.user.id, actorRole: auth.user.role, action: 'user.status.updated', entityType: 'user', entityId: empId, details: { status, tenantCode: targetTenant.tenant_code } });
    sendJson(res, 200, { ok: true });
    return;
  }

  const userDeleteMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (req.method === 'DELETE' && userDeleteMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['master'], res)) return;
    const empId = decodeURIComponent(userDeleteMatch[1]);
    const raw = await readBody(req);
    const body = parseJsonSafe(raw, {});
    const targetTenant = resolveAdminTargetTenant(auth, body);
    if (!targetTenant) return sendJson(res, 404, { error: 'Tenant not found' });
    const result = db.prepare('DELETE FROM users WHERE tenant_id = ? AND emp_id = ? AND role != ?').run(targetTenant.id, empId, 'master');
    if (!result.changes) return sendJson(res, 404, { error: 'User not found' });
    logAudit({ tenantId: targetTenant.id, actorUserId: auth.user.id, actorRole: auth.user.role, action: 'user.deleted', entityType: 'user', entityId: empId, details: { tenantCode: targetTenant.tenant_code } });
    sendJson(res, 200, { ok: true });
    return;
  }

  const userTypeMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/type$/);
  if (req.method === 'PATCH' && userTypeMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['master'], res)) return;
    const empId = decodeURIComponent(userTypeMatch[1]);
    const raw = await readBody(req);
    const body = parseJsonSafe(raw, {});
    const targetTenant = resolveAdminTargetTenant(auth, body);
    if (!targetTenant) return sendJson(res, 404, { error: 'Tenant not found' });
    const userType = body.userType === 'manager' ? 'manager' : 'associate';
    const result = db.prepare('UPDATE users SET user_type = ?, updated_at = ? WHERE tenant_id = ? AND emp_id = ? AND role != ?').run(userType, nowIso(), targetTenant.id, empId, 'master');
    if (!result.changes) return sendJson(res, 404, { error: 'User not found' });
    logAudit({ tenantId: targetTenant.id, actorUserId: auth.user.id, actorRole: auth.user.role, action: 'user.type.updated', entityType: 'user', entityId: empId, details: { userType, tenantCode: targetTenant.tenant_code } });
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/notifications') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    sendJson(res, 200, { notifications: getNotificationsState(auth.user.tenantId, auth.user.id) });
    return;
  }

  const notificationReadMatch = pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if (req.method === 'POST' && notificationReadMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const notificationId = decodeURIComponent(notificationReadMatch[1]);
    const row = db.prepare('SELECT * FROM notifications WHERE tenant_id = ? AND user_id = ? AND id = ?').get(auth.user.tenantId, auth.user.id, notificationId);
    if (!row) return sendJson(res, 404, { error: 'Notification not found' });
    const payload = parseJsonSafe(row.payload_json, {});
    payload.read = true;
    payload.readAt = nowIso();
    db.prepare('UPDATE notifications SET payload_json = ?, updated_at = ? WHERE tenant_id = ? AND user_id = ? AND id = ?').run(json(payload), nowIso(), auth.user.tenantId, auth.user.id, notificationId);
    sendJson(res, 200, { notification: payload });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/tasks') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    sendJson(res, 200, { tasks: getDisciplinaryActionsForUser(auth.user.tenantId, auth.user.id) });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/disciplinary-actions') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!isManagerLike(auth.user)) return sendJson(res, 403, { error: 'Forbidden' });
    sendJson(res, 200, {
      actions: getDisciplinaryActionsForManagerView(auth.user.tenantId, auth.user.id, auth.user.role === 'master' || auth.user.role === 'admin')
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/disciplinary-actions') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!isManagerLike(auth.user)) return sendJson(res, 403, { error: 'Forbidden' });
    const raw = await readBody(req);
    const body = parseJsonSafe(raw, {});
    const targetEmpId = cleanText(body.targetEmpId, 40);
    const targetUser = db.prepare("SELECT * FROM users WHERE tenant_id = ? AND emp_id = ? AND role != 'master'").get(auth.user.tenantId, targetEmpId);
    if (!targetUser) return sendJson(res, 404, { error: 'Target employee not found' });
    const createdAt = nowIso();
    const actionId = cleanId(body.id || `DISC-${Date.now()}`, 'DISC');
    const actionType = body.actionType === 'warning' ? 'warning' : 'misconduct';
    const severity = ['low', 'medium', 'high', 'critical'].includes(String(body.severity || '').toLowerCase())
      ? String(body.severity).toLowerCase()
      : 'medium';
    const payload = {
      id: actionId,
      actionType,
      caseTitle: cleanText(body.caseTitle, 160),
      misconductType: cleanText(body.misconductType, 120),
      severity,
      incidentDate: cleanText(body.incidentDate, 40),
      policyReference: cleanText(body.policyReference, 240),
      repercussions: cleanText(body.repercussions, 4000),
      process: cleanText(body.process, 4000),
      details: cleanText(body.details, 4000),
      status: 'pending',
      createdAt,
      updatedAt: createdAt,
      dueDate: cleanText(body.dueDate, 40),
      issuerName: auth.user.name,
      issuerEmpId: auth.user.empId,
      issuerRole: auth.user.role,
      targetUserId: targetUser.id,
      targetName: targetUser.name,
      targetEmpId: targetUser.emp_id,
      targetDept: targetUser.dept,
      targetProperty: targetUser.property,
      acknowledgement: ''
    };
    db.prepare(`
      INSERT INTO disciplinary_actions (id, tenant_id, created_by_user_id, target_user_id, payload_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(actionId, auth.user.tenantId, auth.user.id, targetUser.id, json(payload), createdAt, createdAt);
    addNotificationRecord({
      tenantId: auth.user.tenantId,
      userId: targetUser.id,
      title: actionType === 'warning' ? 'Manager warning shared' : 'Misconduct review assigned',
      desc: `${auth.user.name} shared a ${actionType} workflow with you. Review it under My Tasks.`,
      type: actionType,
      relatedType: 'disciplinary_action',
      relatedId: actionId,
      meta: {
        kind: 'disciplinary_action_assigned',
        actionType,
        issuerName: auth.user.name,
        caseTitle: cleanText(body.caseTitle, 160),
        misconductType: cleanText(body.misconductType, 120)
      }
    });
    logAudit({ tenantId: auth.user.tenantId, actorUserId: auth.user.id, actorRole: auth.user.role, action: 'disciplinary_action.created', entityType: 'disciplinary_action', entityId: actionId, details: { targetEmpId, actionType } });
    sendJson(res, 201, { action: payload });
    return;
  }

  const disciplinaryAckMatch = pathname.match(/^\/api\/disciplinary-actions\/([^/]+)\/acknowledge$/);
  if (req.method === 'PATCH' && disciplinaryAckMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const actionId = decodeURIComponent(disciplinaryAckMatch[1]);
    const row = db.prepare('SELECT * FROM disciplinary_actions WHERE tenant_id = ? AND id = ?').get(auth.user.tenantId, actionId);
    if (!row) return sendJson(res, 404, { error: 'Action not found' });
    const payload = parseJsonSafe(row.payload_json, {});
    const canManageAction = auth.user.role === 'admin' || auth.user.role === 'master' || row.created_by_user_id === auth.user.id;
    if (payload.targetUserId !== auth.user.id && !canManageAction) return sendJson(res, 403, { error: 'Forbidden' });
    const raw = await readBody(req);
    const body = parseJsonSafe(raw, {});
    payload.status = body.status === 'closed' ? 'closed' : 'acknowledged';
    payload.acknowledgement = cleanText(body.acknowledgement, 2000);
    payload.updatedAt = nowIso();
    db.prepare('UPDATE disciplinary_actions SET payload_json = ?, updated_at = ? WHERE tenant_id = ? AND id = ?').run(json(payload), payload.updatedAt, auth.user.tenantId, actionId);
    if (payload.targetUserId === auth.user.id) {
      addNotificationRecord({
        tenantId: auth.user.tenantId,
        userId: row.created_by_user_id,
        title: payload.status === 'closed' ? 'Conduct case closed by employee' : 'Conduct task acknowledged',
        desc: `${auth.user.name} responded to the ${payload.actionType} case${payload.caseTitle ? ` "${payload.caseTitle}"` : ''}.`,
        type: 'info',
        relatedType: 'disciplinary_action',
        relatedId: actionId,
        meta: {
          kind: 'disciplinary_action_acknowledged',
          actionType: payload.actionType,
          employeeName: auth.user.name,
          caseTitle: payload.caseTitle,
          status: payload.status
        }
      });
    }
    logAudit({ tenantId: auth.user.tenantId, actorUserId: auth.user.id, actorRole: auth.user.role, action: 'disciplinary_action.acknowledged', entityType: 'disciplinary_action', entityId: actionId, details: { status: payload.status } });
    sendJson(res, 200, { action: payload });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/sources/sheet-link') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['admin', 'master'], res)) return;
    const tenant = db.prepare('SELECT tenant_code FROM tenants WHERE id = ?').get(auth.user.tenantId);
    const syncLink = `${APP_BASE_URL}/api/sources/google-sheet/sync?tenant=${encodeURIComponent(tenant.tenant_code)}`;
    sendJson(res, 200, { link: syncLink, note: 'POST your sheet URL to this endpoint to ingest Google Sheets data into Bloomie.' });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/sources') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['admin', 'master'], res)) return;
    sendJson(res, 200, { sources: getKnowledgeSources(auth.user.tenantId) });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/sources/google-sheet/sync') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['admin', 'master'], res)) return;
    const raw = await readBody(req);
    const body = parseJsonSafe(raw, {});
    const sheetUrl = cleanText(body.sheetUrl || body.url, 2000);
    if (!sheetUrl) return sendJson(res, 400, { error: 'sheetUrl is required' });
    try {
      const result = await syncGoogleSheetSource({ tenantId: auth.user.tenantId, url: sheetUrl, title: body.title });
      patchTenantConfig(auth.user.tenantId, { sheetUrl });
      logAudit({ tenantId: auth.user.tenantId, actorUserId: auth.user.id, actorRole: auth.user.role, action: 'knowledge.google_sheet.synced', entityType: 'knowledge_source', entityId: result.sourceId, details: { rowCount: result.rowCount, location: result.location } });
      sendJson(res, 201, { ok: true, source: result, sources: getKnowledgeSources(auth.user.tenantId) });
    } catch (err) {
      sendJson(res, 502, { error: 'Sheet sync failed', detail: err.message });
    }
    return;
  }

  const sourceSnapshotMatch = pathname.match(/^\/api\/sources\/([^/]+)\/snapshot$/);
  if (req.method === 'GET' && sourceSnapshotMatch) {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!requireRole(auth, ['admin', 'master'], res)) return;
    const sourceId = decodeURIComponent(sourceSnapshotMatch[1]);
    const snapshot = db.prepare(`
      SELECT * FROM source_snapshots
      WHERE tenant_id = ? AND source_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(auth.user.tenantId, sourceId);
    if (!snapshot) return sendJson(res, 404, { error: 'Snapshot not found' });
    sendJson(res, 200, {
      sourceId,
      rowCount: snapshot.row_count,
      createdAt: snapshot.created_at,
      rows: parseJsonSafe(snapshot.content_json, [])
    });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

initDb();

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
    if (urlObj.pathname.startsWith('/api/')) {
      await handleApi(req, res, urlObj);
    } else {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendText(res, 405, 'Method Not Allowed');
      } else {
        serveStatic(req, res, urlObj.pathname);
      }
    }
  } catch (err) {
    console.error(err);
    recordError(err, 'http');
    sendJson(res, 500, { error: 'Internal server error', detail: err.message });
  } finally {
    const route = req.url.split('?')[0];
    const statusCode = res.statusCode || 200;
    trackMetric(route, statusCode);
    appendLog('app.log', `${getClientIp(req)} "${req.method} ${route}" ${statusCode} ${Date.now() - started}ms`);
  }
});

setInterval(() => {
  runSheetSyncWorker().catch(err => recordError(err, 'sheet-sync-worker'));
}, SHEET_SYNC_INTERVAL_MS).unref();

setInterval(() => {
  try {
    writeBackupSnapshot('auto');
  } catch (err) {
    recordError(err, 'auto-backup');
  }
}, BACKUP_INTERVAL_MS).unref();

server.listen(PORT, HOST, () => {
  console.log(`Bloomie server listening on http://${HOST}:${PORT}`);
  console.log(`Database: ${DB_PATH}`);
  (async () => {
    try {
      await runSheetSyncWorker();
    } catch (err) {
      recordError(err, 'sheet-sync-startup');
    }
    try {
      writeBackupSnapshot('startup');
    } catch (err) {
      recordError(err, 'startup-backup');
    }
  })();
});
