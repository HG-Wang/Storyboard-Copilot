import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const PORT = process.env.PORT || 3142;
const DATA_DIR = join(ROOT_DIR, '.data');
const IMAGES_DIR = join(DATA_DIR, 'images');
const DIST_DIR = join(ROOT_DIR, 'dist');
const JWT_SECRET = process.env.JWT_SECRET || 'storyboard-copilot-secret-change-me';
const JWT_EXPIRES_IN = '7d';
const BCRYPT_ROUNDS = 10;
const SIGNUP_BONUS_CREDITS = parseInt(process.env.SIGNUP_BONUS_CREDITS || '100', 10);
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(IMAGES_DIR, { recursive: true });

// ==================== DATABASE ====================

const db = new Database(join(DATA_DIR, 'projects.db'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    node_count INTEGER NOT NULL DEFAULT 0,
    nodes_json TEXT NOT NULL,
    edges_json TEXT NOT NULL,
    viewport_json TEXT NOT NULL,
    history_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    credits INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

  CREATE TABLE IF NOT EXISTS credit_transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    amount INTEGER NOT NULL,
    balance_before INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    type TEXT NOT NULL,
    reference TEXT,
    note TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_credit_txn_user ON credit_transactions(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS ai_usage_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    credits_used INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage_log(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS provider_config (
    provider_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    api_key TEXT NOT NULL,
    base_url TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS model_pricing (
    model_id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    display_name TEXT,
    credits_per_image INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Migration: add user_id column to projects if missing
try {
  const cols = db.prepare("PRAGMA table_info(projects)").all();
  if (!cols.some(c => c.name === 'user_id')) {
    db.exec("ALTER TABLE projects ADD COLUMN user_id TEXT NOT NULL DEFAULT ''");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)");
} catch (e) { console.warn('Migration warning:', e.message); }

// Seed default admin user if not exists
const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, BCRYPT_ROUNDS);
  db.prepare(`
    INSERT INTO users (id, username, email, password_hash, role, credits, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), 'admin', 'admin@storyboard.local', hash, 'admin', 999999, nowMs(), nowMs());
  console.log('Default admin user created (username: admin, password: ' + DEFAULT_ADMIN_PASSWORD + ')');
}

// Seed default model pricing if empty
const pricingCount = db.prepare('SELECT COUNT(*) as count FROM model_pricing').get();
if (pricingCount.count === 0) {
  const defaultPricing = [
    { model: 'grsai/nano-banana-pro-v2', provider: 'grsai', name: 'GRSAI Nano Banana Pro V2', credits: 2 },
    { model: 'grsai/nano-banana-pro', provider: 'grsai', name: 'GRSAI Nano Banana Pro', credits: 1 },
    { model: 'kie/keling-v1.5', provider: 'kie', name: 'KIE Keling V1.5', credits: 2 },
    { model: 'kie/keling-v2', provider: 'kie', name: 'KIE Keling V2', credits: 3 },
    { model: 'ppio/seedream-4', provider: 'ppio', name: 'PPIO Seedream 4', credits: 2 },
    { model: 'ppio/seedream-4-turbo', provider: 'ppio', name: 'PPIO Seedream 4 Turbo', credits: 1 },
    { model: 'fal/flux-pro-v1.1', provider: 'fal', name: 'FAL Flux Pro V1.1', credits: 3 },
    { model: 'fal/flux-dev', provider: 'fal', name: 'FAL Flux Dev', credits: 1 },
  ];
  const stmt = db.prepare('INSERT INTO model_pricing (model_id, provider_id, display_name, credits_per_image, created_at) VALUES (?, ?, ?, ?, ?)');
  for (const p of defaultPricing) {
    stmt.run(p.model, p.provider, p.name, p.credits, nowMs());
  }
}

// ==================== HELPERS ====================

function nowMs() { return Date.now(); }

function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a || 1;
}

function persistImage(base64OrDataUrl) {
  const isDataUrl = base64OrDataUrl.startsWith('data:');
  let base64 = base64OrDataUrl;
  let ext = 'png';
  if (isDataUrl) {
    const match = base64OrDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (match) { ext = match[1].split('/')[1] || 'png'; base64 = match[2]; }
    else { base64 = base64OrDataUrl.split(',')[1] || base64OrDataUrl; }
  }
  const buffer = Buffer.from(base64, 'base64');
  const hash = uuidv4().replace(/-/g, '');
  const filename = `${hash}.${ext}`;
  const filepath = join(IMAGES_DIR, filename);
  writeFileSync(filepath, buffer);
  return filepath;
}

async function createPreview(filepath, maxDimension = 512) {
  try {
    const metadata = await sharp(filepath).metadata();
    const longest = Math.max(metadata.width || 0, metadata.height || 0);
    if (longest <= maxDimension) return filepath;
    const previewPath = filepath.replace(/\.(\w+)$/, '_preview.$1');
    await sharp(filepath).resize(maxDimension, maxDimension, { fit: 'inside', withoutEnlargement: true }).toFile(previewPath);
    return previewPath;
  } catch { return filepath; }
}

function imageToBase64DataUrl(filepath) {
  const buffer = readFileSync(filepath);
  const ext = filepath.split('.').pop()?.toLowerCase() || 'png';
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  return `data:image/${mime};base64,${buffer.toString('base64')}`;
}

// ==================== AUTH MIDDLEWARE ====================

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}

// ==================== APP SETUP ====================

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));

function handleCommand(command, handler, { auth = false, admin = false } = {}) {
  const middlewares = [];
  if (auth) middlewares.push(authMiddleware);
  if (admin) middlewares.push(adminMiddleware);
  app.post(`/api/${command}`, ...middlewares, async (req, res) => {
    try {
      const result = await handler(req.body, req.user);
      res.json(result);
    } catch (error) {
      console.error(`[${command}] Error:`, error.message);
      res.status(500).json({ error: error.message });
    }
  });
}

// ==================== AUTH ENDPOINTS ====================

handleCommand('auth_register', async ({ username, password, email }) => {
  if (!username || username.length < 3) throw new Error('用户名至少 3 个字符');
  if (!password || password.length < 6) throw new Error('密码至少 6 个字符');

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) throw new Error('用户名已存在');

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const credits = SIGNUP_BONUS_CREDITS;
  const ts = nowMs();

  db.prepare(`
    INSERT INTO users (id, username, email, password_hash, role, credits, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'user', ?, ?, ?)
  `).run(id, username, email || null, passwordHash, credits, ts, ts);

  if (credits > 0) {
    db.prepare(`
      INSERT INTO credit_transactions (id, user_id, amount, balance_before, balance_after, type, note, created_at)
      VALUES (?, ?, ?, 0, ?, 'signup_bonus', '注册赠送积分', ?)
    `).run(uuidv4(), id, credits, credits, ts);
  }

  const user = { id, username, role: 'user' };
  const token = generateToken(user);
  return { token, user: { id, username, role: 'user', credits } };
});

handleCommand('auth_login', async ({ username, password }) => {
  if (!username || !password) throw new Error('请输入用户名和密码');

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) throw new Error('用户名或密码错误');

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) throw new Error('用户名或密码错误');

  const token = generateToken({ id: user.id, username: user.username, role: user.role });
  return {
    token,
    user: { id: user.id, username: user.username, role: user.role, credits: user.credits },
  };
});

handleCommand('auth_me', async (body, user) => {
  const row = db.prepare('SELECT id, username, email, role, credits FROM users WHERE id = ?').get(user.id);
  if (!row) throw new Error('用户不存在');
  return row;
}, { auth: true });

// ==================== CREDIT ENDPOINTS ====================

handleCommand('credit_balance', async (body, user) => {
  const row = db.prepare('SELECT credits FROM users WHERE id = ?').get(user.id);
  return { credits: row?.credits ?? 0 };
}, { auth: true });

handleCommand('credit_transactions', async ({ page, pageSize }, user) => {
  const p = Math.max(1, page || 1);
  const ps = Math.min(50, Math.max(1, pageSize || 20));
  const offset = (p - 1) * ps;

  const total = db.prepare('SELECT COUNT(*) as count FROM credit_transactions WHERE user_id = ?').get(user.id).count;
  const rows = db.prepare('SELECT * FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(user.id, ps, offset);
  return { rows, total, page: p, pageSize: ps };
}, { auth: true });

// ==================== ADMIN ENDPOINTS ====================

handleCommand('admin_users', async ({ page, pageSize, search }) => {
  const p = Math.max(1, page || 1);
  const ps = Math.min(100, Math.max(1, pageSize || 20));
  const offset = (p - 1) * ps;
  let where = '1=1';
  const params = [];
  if (search) {
    where = 'username LIKE ?';
    params.push(`%${search}%`);
  }

  const total = db.prepare(`SELECT COUNT(*) as count FROM users WHERE ${where}`).get(...params).count;
  const rows = db.prepare(`SELECT id, username, email, role, credits, created_at, updated_at FROM users WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, ps, offset);
  return { rows, total, page: p, pageSize: ps };
}, { auth: true, admin: true });

handleCommand('admin_recharge_credits', async ({ userId, amount, note }) => {
  if (!userId || !amount || amount <= 0) throw new Error('参数错误');
  const user = db.prepare('SELECT credits FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('用户不存在');

  const before = user.credits;
  const after = before + amount;
  const ts = nowMs();

  db.prepare('UPDATE users SET credits = ?, updated_at = ? WHERE id = ?').run(after, ts, userId);
  db.prepare(`
    INSERT INTO credit_transactions (id, user_id, amount, balance_before, balance_after, type, note, created_at)
    VALUES (?, ?, ?, ?, ?, 'recharge', ?, ?)
  `).run(uuidv4(), userId, amount, before, after, note || '管理员充值', ts);

  return { credits: after };
}, { auth: true, admin: true });

handleCommand('admin_deduct_credits', async ({ userId, amount, note }) => {
  if (!userId || !amount || amount <= 0) throw new Error('参数错误');
  const user = db.prepare('SELECT credits FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('用户不存在');
  if (user.credits < amount) throw new Error('用户积分不足');

  const before = user.credits;
  const after = before - amount;
  const ts = nowMs();

  db.prepare('UPDATE users SET credits = ?, updated_at = ? WHERE id = ?').run(after, ts, userId);
  db.prepare(`
    INSERT INTO credit_transactions (id, user_id, amount, balance_before, balance_after, type, note, created_at)
    VALUES (?, ?, ?, ?, ?, 'admin_deduct', ?, ?)
  `).run(uuidv4(), userId, -amount, before, after, note || '管理员扣减', ts);

  return { credits: after };
}, { auth: true, admin: true });

handleCommand('admin_set_role', async ({ userId, role }) => {
  if (!userId || !['user', 'admin'].includes(role)) throw new Error('参数错误');
  db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, nowMs(), userId);
  return { ok: true };
}, { auth: true, admin: true });

handleCommand('admin_delete_user', async ({ userId }) => {
  if (!userId) throw new Error('参数错误');
  db.prepare('DELETE FROM users WHERE id = ? AND role != ?').run(userId, 'admin');
  return { ok: true };
}, { auth: true, admin: true });

handleCommand('admin_ai_usage', async ({ page, pageSize, userId }) => {
  const p = Math.max(1, page || 1);
  const ps = Math.min(100, Math.max(1, pageSize || 20));
  const offset = (p - 1) * ps;
  let where = '1=1';
  const params = [];
  if (userId) { where = 'user_id = ?'; params.push(userId); }

  const total = db.prepare(`SELECT COUNT(*) as count FROM ai_usage_log WHERE ${where}`).get(...params).count;
  const rows = db.prepare(`SELECT * FROM ai_usage_log WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, ps, offset);
  return { rows, total, page: p, pageSize: ps };
}, { auth: true, admin: true });

// ==================== ADMIN: PROVIDER CONFIG ====================

handleCommand('admin_list_providers', async () => {
  const rows = db.prepare('SELECT provider_id, display_name, api_key, base_url, enabled FROM provider_config ORDER BY provider_id').all();
  const models = db.prepare('SELECT model_id, provider_id, display_name, credits_per_image FROM model_pricing ORDER BY provider_id, model_id').all();
  const modelsByProvider = {};
  for (const m of models) {
    (modelsByProvider[m.provider_id] ??= []).push(m);
  }
  return rows.map(r => ({ ...r, models: modelsByProvider[r.provider_id] || [] }));
}, { auth: true, admin: true });

handleCommand('admin_save_provider', async ({ provider_id, display_name, api_key, base_url, enabled }) => {
  if (!provider_id || !api_key) throw new Error('Provider ID 和 API Key 不能为空');
  const ts = nowMs();
  db.prepare(`
    INSERT INTO provider_config (provider_id, display_name, api_key, base_url, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider_id) DO UPDATE SET
      display_name = excluded.display_name, api_key = excluded.api_key,
      base_url = excluded.base_url, enabled = excluded.enabled, updated_at = excluded.updated_at
  `).run(provider_id, display_name || provider_id, api_key, base_url || null, enabled !== false ? 1 : 0, ts, ts);
  return { ok: true };
}, { auth: true, admin: true });

handleCommand('admin_delete_provider', async ({ provider_id }) => {
  db.prepare('DELETE FROM provider_config WHERE provider_id = ?').run(provider_id);
  return { ok: true };
}, { auth: true, admin: true });

// ==================== ADMIN: MODEL PRICING ====================

handleCommand('admin_list_pricing', async () => {
  return db.prepare('SELECT * FROM model_pricing ORDER BY provider_id, model_id').all();
}, { auth: true, admin: true });

handleCommand('admin_save_pricing', async ({ model_id, provider_id, display_name, credits_per_image }) => {
  if (!model_id || !provider_id) throw new Error('Model ID 和 Provider ID 不能为空');
  const ts = nowMs();
  db.prepare(`
    INSERT INTO model_pricing (model_id, provider_id, display_name, credits_per_image, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(model_id) DO UPDATE SET
      provider_id = excluded.provider_id, display_name = excluded.display_name,
      credits_per_image = excluded.credits_per_image
  `).run(model_id, provider_id, display_name || model_id, Math.max(1, credits_per_image || 1), ts);
  return { ok: true };
}, { auth: true, admin: true });

handleCommand('admin_delete_pricing', async ({ model_id }) => {
  db.prepare('DELETE FROM model_pricing WHERE model_id = ?').run(model_id);
  return { ok: true };
}, { auth: true, admin: true });

// ==================== ADMIN: DASHBOARD & STATS ====================

handleCommand('admin_stats', async () => {
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const totalAdmins = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='admin'").get().c;
  const totalCreditsIssued = db.prepare('SELECT COALESCE(SUM(amount),0) as c FROM credit_transactions WHERE amount > 0').get().c;
  const totalCreditsConsumed = db.prepare('SELECT COALESCE(SUM(ABS(amount)),0) as c FROM credit_transactions WHERE amount < 0 AND type=\'consume\'').get().c;
  const totalGenerations = db.prepare('SELECT COUNT(*) as c FROM ai_usage_log').get().c;
  const successGenerations = db.prepare("SELECT COUNT(*) as c FROM ai_usage_log WHERE status='succeeded'").get().c;
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayTs = todayStart.getTime();
  const todayUsers = db.prepare('SELECT COUNT(DISTINCT user_id) as c FROM ai_usage_log WHERE created_at >= ?').get(todayTs).c;
  const todayGenerations = db.prepare('SELECT COUNT(*) as c FROM ai_usage_log WHERE created_at >= ?').get(todayTs).c;
  const todayConsumed = db.prepare('SELECT COALESCE(SUM(ABS(amount)),0) as c FROM credit_transactions WHERE created_at >= ? AND type=\'consume\'').get(todayTs).c;

  const topModels = db.prepare(`
    SELECT model, COUNT(*) as count, SUM(credits_used) as total_credits
    FROM ai_usage_log WHERE status='succeeded'
    GROUP BY model ORDER BY count DESC LIMIT 10
  `).all();

  const recentUsers = db.prepare(`
    SELECT id, username, role, credits, created_at FROM users ORDER BY created_at DESC LIMIT 5
  `).all();

  return {
    totalUsers, totalAdmins, totalCreditsIssued, totalCreditsConsumed,
    totalGenerations, successGenerations,
    todayUsers, todayGenerations, todayConsumed,
    topModels, recentUsers,
  };
}, { auth: true, admin: true });

handleCommand('admin_user_detail', async ({ userId }) => {
  const user = db.prepare('SELECT id, username, email, role, credits, created_at, updated_at FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('用户不存在');
  const txnCount = db.prepare('SELECT COUNT(*) as c FROM credit_transactions WHERE user_id = ?').get(userId).c;
  const usageCount = db.prepare('SELECT COUNT(*) as c FROM ai_usage_log WHERE user_id = ?').get(userId).c;
  const totalConsumed = db.prepare("SELECT COALESCE(SUM(credits_used),0) as c FROM ai_usage_log WHERE user_id = ? AND status='succeeded'").get(userId).c;
  const recentTxns = db.prepare('SELECT * FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(userId);
  const recentUsage = db.prepare('SELECT * FROM ai_usage_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(userId);
  return { ...user, txnCount, usageCount, totalConsumed, recentTxns, recentUsage };
}, { auth: true, admin: true });

handleCommand('admin_toggle_provider', async ({ provider_id, enabled }) => {
  db.prepare('UPDATE provider_config SET enabled = ?, updated_at = ? WHERE provider_id = ?').run(enabled ? 1 : 0, nowMs(), provider_id);
  return { ok: true };
}, { auth: true, admin: true });

handleCommand('admin_system_config', async (body) => {
  if (body.get) {
    const row = db.prepare('SELECT value FROM system_config WHERE key = ?').get(body.key);
    return { value: row?.value ?? null };
  }
  if (body.set) {
    db.prepare(`INSERT INTO system_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(body.key, body.value);
    return { ok: true };
  }
  const all = db.prepare('SELECT * FROM system_config').all();
  return all;
}, { auth: true, admin: true });

handleCommand('admin_usage_stats', async () => {
  const byProvider = db.prepare(`
    SELECT provider, COUNT(*) as count, SUM(credits_used) as credits
    FROM ai_usage_log GROUP BY provider ORDER BY count DESC
  `).all();
  const byDay = db.prepare(`
    SELECT DATE(created_at/1000, 'unixepoch', 'localtime') as day, COUNT(*) as count, SUM(credits_used) as credits
    FROM ai_usage_log WHERE created_at > ?
    GROUP BY day ORDER BY day DESC LIMIT 30
  `).all(nowMs() - 30 * 86400000);
  return { byProvider, byDay };
}, { auth: true, admin: true });

// ==================== PUBLIC: MODEL LIST & PRICING ====================

handleCommand('list_models', async () => {
  const rows = db.prepare('SELECT model_id, provider_id, display_name, credits_per_image FROM model_pricing ORDER BY provider_id, model_id').all();
  return rows;
});

// ==================== PROJECT COMMANDS (auth required) ====================

handleCommand('list_project_summaries', (body, user) => {
  return db.prepare(`
    SELECT id, name, created_at as createdAt, updated_at as updatedAt, node_count as nodeCount
    FROM projects WHERE user_id = ? ORDER BY updated_at DESC
  `).all(user.id);
}, { auth: true });

handleCommand('get_project_record', ({ projectId }, user) => {
  return db.prepare(`
    SELECT id, name, created_at as createdAt, updated_at as updatedAt, node_count as nodeCount,
           nodes_json as nodesJson, edges_json as edgesJson, viewport_json as viewportJson, history_json as historyJson
    FROM projects WHERE id = ? AND user_id = ?
  `).get(projectId, user.id) || null;
}, { auth: true });

handleCommand('upsert_project_record', ({ record }, user) => {
  const { id, name, createdAt, updatedAt, nodeCount, nodesJson, edgesJson, viewportJson, historyJson } = record;
  db.prepare(`
    INSERT INTO projects (id, user_id, name, created_at, updated_at, node_count, nodes_json, edges_json, viewport_json, history_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, created_at = excluded.created_at, updated_at = excluded.updated_at,
      node_count = excluded.node_count, nodes_json = excluded.nodes_json,
      edges_json = excluded.edges_json, viewport_json = excluded.viewport_json, history_json = excluded.history_json
  `).run(id, user.id, name, createdAt, updatedAt, nodeCount, nodesJson, edgesJson, viewportJson, historyJson);
  return null;
}, { auth: true });

handleCommand('update_project_viewport_record', ({ projectId, viewportJson }, user) => {
  db.prepare('UPDATE projects SET viewport_json = ? WHERE id = ? AND user_id = ?').run(viewportJson, projectId, user.id);
  return null;
}, { auth: true });

handleCommand('rename_project_record', ({ projectId, name, updatedAt }, user) => {
  db.prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(name, updatedAt, projectId, user.id);
  return null;
}, { auth: true });

handleCommand('delete_project_record', ({ projectId }, user) => {
  db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(projectId, user.id);
  return null;
}, { auth: true });

// ==================== IMAGE COMMANDS ====================

handleCommand('split_image', async ({ imageBase64, rows, cols, lineThickness }) => {
  const safeRows = Math.max(1, rows || 1);
  const safeCols = Math.max(1, cols || 1);
  const lineThick = lineThickness || 0;
  const buffer = Buffer.from(imageBase64, 'base64');
  const metadata = await sharp(buffer).metadata();
  const { width, height } = metadata;
  const usableW = width - (safeCols - 1) * lineThick;
  const usableH = height - (safeRows - 1) * lineThick;
  if (usableW < safeCols || usableH < safeRows) throw new Error('分割线过粗，无法完成切割');
  const cellW = Math.floor(usableW / safeCols);
  const cellH = Math.floor(usableH / safeRows);
  const results = [];
  for (let r = 0; r < safeRows; r++) {
    for (let c = 0; c < safeCols; c++) {
      const x = c * (cellW + lineThick);
      const y = r * (cellH + lineThick);
      const cellBuffer = await sharp(buffer).extract({ left: x, top: y, width: cellW, height: cellH }).png().toBuffer();
      results.push(`data:image/png;base64,${cellBuffer.toString('base64')}`);
    }
  }
  return results;
}, { auth: true });

handleCommand('split_image_source', async ({ source, rows, cols, lineThickness }) => {
  let input;
  if (source.startsWith('data:')) { input = Buffer.from(source.split(',')[1], 'base64'); }
  else if (existsSync(source)) { input = source; }
  else { input = Buffer.from(source, 'base64'); }
  const metadata = await sharp(input).metadata();
  const buf = Buffer.isBuffer(input) ? input : readFileSync(input);
  return (await (async () => {
    const safeRows = Math.max(1, rows || 1);
    const safeCols = Math.max(1, cols || 1);
    const lineThick = lineThickness || 0;
    const usableW = metadata.width - (safeCols - 1) * lineThick;
    const usableH = metadata.height - (safeRows - 1) * lineThick;
    const cellW = Math.floor(usableW / safeCols);
    const cellH = Math.floor(usableH / safeRows);
    const results = [];
    for (let r = 0; r < safeRows; r++) {
      for (let c = 0; c < safeCols; c++) {
        const x = c * (cellW + lineThick);
        const y = r * (cellH + lineThick);
        const cellBuffer = await sharp(buf).extract({ left: x, top: y, width: cellW, height: cellH }).png().toBuffer();
        results.push(`data:image/png;base64,${cellBuffer.toString('base64')}`);
      }
    }
    return results;
  })());
}, { auth: true });

handleCommand('crop_image_source', async ({ payload }) => {
  const { source, cropX, cropY, cropWidth, cropHeight } = payload;
  let input;
  if (source.startsWith('data:')) { input = Buffer.from(source.split(',')[1], 'base64'); }
  else if (existsSync(source)) { input = source; }
  else { input = Buffer.from(source, 'base64'); }
  const buffer = await sharp(input).extract({
    left: Math.round(cropX || 0), top: Math.round(cropY || 0),
    width: Math.round(cropWidth || 100), height: Math.round(cropHeight || 100),
  }).png().toBuffer();
  return `data:image/png;base64,${buffer.toString('base64')}`;
}, { auth: true });

handleCommand('prepare_node_image_source', async ({ source, maxPreviewDimension }) => {
  const maxDim = maxPreviewDimension || 512;
  let filepath;
  if (source.startsWith('data:')) { filepath = persistImage(source); }
  else if (existsSync(source)) { filepath = source; }
  else { filepath = persistImage(source); }
  const previewPath = await createPreview(filepath, maxDim);
  const metadata = await sharp(filepath).metadata();
  const divisor = gcd(metadata.width, metadata.height);
  return { imagePath: filepath, previewImagePath: previewPath, aspectRatio: `${metadata.width / divisor}:${metadata.height / divisor}` };
}, { auth: true });

handleCommand('prepare_node_image_binary', async ({ bytes, extension, maxPreviewDimension }) => {
  const maxDim = maxPreviewDimension || 512;
  const ext = extension || 'png';
  const hash = uuidv4().replace(/-/g, '');
  const filepath = join(IMAGES_DIR, `${hash}.${ext}`);
  writeFileSync(filepath, Buffer.from(bytes));
  const previewPath = await createPreview(filepath, maxDim);
  const metadata = await sharp(filepath).metadata();
  const divisor = gcd(metadata.width, metadata.height);
  return { imagePath: filepath, previewImagePath: previewPath, aspectRatio: `${metadata.width / divisor}:${metadata.height / divisor}` };
}, { auth: true });

handleCommand('persist_image_source', async ({ source }) => {
  if (existsSync(source)) return source;
  return persistImage(source);
}, { auth: true });

handleCommand('persist_image_binary', async ({ bytes, extension }) => {
  const ext = extension || 'png';
  const hash = uuidv4().replace(/-/g, '');
  const filepath = join(IMAGES_DIR, `${hash}.${ext}`);
  writeFileSync(filepath, Buffer.from(bytes));
  return filepath;
}, { auth: true });

handleCommand('load_image', async ({ filePath }) => {
  if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
  return imageToBase64DataUrl(filePath);
}, { auth: true });

handleCommand('merge_storyboard_images', async ({ payload }) => {
  const {
    frameSources, rows, cols, cellGap, outerPadding, noteHeight,
    fontSize, backgroundColor, maxDimension, imageFit,
  } = payload;
  const safeRows = Math.max(1, rows || 1);
  const safeCols = Math.max(1, cols || 1);
  const gap = Math.max(0, cellGap || 0);
  const pad = Math.max(0, outerPadding || 0);
  const noteH = Math.max(0, noteHeight || 0);
  const fontSz = Math.max(8, fontSize || 16);
  const bgColor = backgroundColor || '#0f1115';
  const maxDim = Math.min(maxDimension || 4096, 4096);

  const frameImages = [];
  for (const src of frameSources || []) {
    try {
      if (!src) { frameImages.push(null); continue; }
      if (src.startsWith('data:')) { frameImages.push(sharp(Buffer.from(src.split(',')[1], 'base64'))); }
      else if (existsSync(src)) { frameImages.push(sharp(src)); }
      else { frameImages.push(sharp(Buffer.from(src, 'base64'))); }
    } catch { frameImages.push(null); }
  }

  let cellW = 512, cellH = 512;
  for (const img of frameImages) {
    if (img) { const meta = await img.metadata(); cellW = meta.width || 512; cellH = meta.height || 512; break; }
  }

  const canvasW = Math.min(pad * 2 + safeCols * cellW + (safeCols - 1) * gap, maxDim);
  const scale = canvasW / (pad * 2 + safeCols * cellW + (safeCols - 1) * gap);
  cellW = Math.round(cellW * scale); cellH = Math.round(cellH * scale);
  const totalH = pad * 2 + safeRows * (cellH + (noteH > 0 ? noteH : 0)) + (safeRows - 1) * gap;
  const canvasH = Math.min(totalH, maxDim);
  const textOverlayApplied = false;

  const composites = [];
  for (let r = 0; r < safeRows; r++) {
    for (let c = 0; c < safeCols; c++) {
      const idx = r * safeCols + c;
      const img = frameImages[idx];
      if (!img) continue;
      const x = pad + c * (cellW + gap);
      const y = pad + r * (cellH + noteH + gap);
      const resized = await img.resize(cellW, cellH, { fit: imageFit === 'contain' ? 'inside' : 'cover', position: 'center' }).toBuffer();
      composites.push({ input: resized, top: y, left: x });
    }
  }

  const bgSvg = `<svg width="${canvasW}" height="${canvasH}"><rect width="100%" height="100%" fill="${bgColor}"/></svg>`;
  const merged = await sharp(Buffer.from(bgSvg)).composite(composites).png().toBuffer();
  const hash = uuidv4().replace(/-/g, '');
  const filepath = join(IMAGES_DIR, `merged_${hash}.png`);
  writeFileSync(filepath, merged);

  return { imagePath: filepath, canvasWidth: canvasW, canvasHeight: canvasH, cellWidth: cellW, cellHeight: cellH, gap, padding: pad, noteHeight: noteH, fontSize: fontSz, textOverlayApplied };
}, { auth: true });

handleCommand('read_storyboard_image_metadata', async ({ source }) => {
  return null;
}, { auth: true });

handleCommand('embed_storyboard_image_metadata', async ({ source }) => {
  return source;
}, { auth: true });

handleCommand('save_image_source_to_downloads', async ({ source, suggestedFileName }) => {
  const filepath = persistImage(source);
  return filepath;
}, { auth: true });

handleCommand('save_image_source_to_path', async ({ source, targetPath }) => {
  const buf = source.startsWith('data:')
    ? Buffer.from(source.split(',')[1], 'base64')
    : existsSync(source) ? readFileSync(source) : Buffer.from(source, 'base64');
  writeFileSync(targetPath, buf);
  return targetPath;
}, { auth: true });

handleCommand('save_image_source_to_directory', async ({ source, targetDir, suggestedFileName }) => {
  const buf = source.startsWith('data:')
    ? Buffer.from(source.split(',')[1], 'base64')
    : existsSync(source) ? readFileSync(source) : Buffer.from(source, 'base64');
  mkdirSync(targetDir, { recursive: true });
  const ext = 'png';
  const name = suggestedFileName || uuidv4();
  const filepath = join(targetDir, `${name}.${ext}`);
  writeFileSync(filepath, buf);
  return filepath;
}, { auth: true });

handleCommand('save_image_source_to_app_debug_dir', async ({ source, category, suggestedFileName }) => {
  const dir = join(IMAGES_DIR, category || 'debug');
  mkdirSync(dir, { recursive: true });
  const filepath = join(dir, suggestedFileName || `${uuidv4()}.png`);
  const buf = source.startsWith('data:')
    ? Buffer.from(source.split(',')[1], 'base64')
    : existsSync(source) ? readFileSync(source) : Buffer.from(source, 'base64');
  writeFileSync(filepath, buf);
  return filepath;
}, { auth: true });

handleCommand('copy_image_source_to_clipboard', async () => {
  return null;
}, { auth: true });

// ==================== AI COMMANDS (auth + credit deduction) ====================

function deductCredits(userId, model) {
  const pricing = db.prepare('SELECT credits_per_image FROM model_pricing WHERE model_id = ?').get(model);
  const cost = pricing?.credits_per_image ?? 1;
  const user = db.prepare('SELECT credits FROM users WHERE id = ?').get(userId);
  if (!user || user.credits < cost) {
    throw new Error(`积分不足，需要 ${cost} 积分，当前余额 ${user?.credits ?? 0}`);
  }
  const before = user.credits;
  const after = before - cost;
  const ts = nowMs();
  db.prepare('UPDATE users SET credits = ?, updated_at = ? WHERE id = ?').run(after, ts, userId);
  db.prepare(`
    INSERT INTO credit_transactions (id, user_id, amount, balance_before, balance_after, type, reference, note, created_at)
    VALUES (?, ?, ?, ?, ?, 'consume', ?, ?, ?)
  `).run(uuidv4(), userId, -cost, before, after, model, `AI生成: ${model}`, ts);
  return cost;
}

function logAiUsage(userId, provider, model, creditsUsed, status) {
  db.prepare(`
    INSERT INTO ai_usage_log (id, user_id, provider, model, credits_used, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), userId, provider, model, creditsUsed, status, nowMs());
}

async function getProviderApiKey(provider) {
  const row = db.prepare('SELECT api_key, base_url FROM provider_config WHERE provider_id = ? AND enabled = 1').get(provider);
  return row || null;
}

function resolveProviderFromModel(model) {
  const pricing = db.prepare('SELECT provider_id FROM model_pricing WHERE model_id = ?').get(model);
  if (pricing) return pricing.provider_id;

  if (model.startsWith('grsai')) return 'grsai';
  if (model.startsWith('kie')) return 'kie';
  if (model.startsWith('ppio')) return 'ppio';
  if (model.startsWith('fal')) return 'fal';
  return null;
}

function getProviderEndpoint(provider) {
  const endpoints = {
    kie: 'https://api.kie.ai/v1/images/generations',
    ppio: 'https://api.ppio.com/v1/images/generations',
    fal: 'https://fal.run/fal-ai',
    grsai: 'https://api.grsai.com/v1/images/generations',
  };
  return endpoints[provider] || '';
}

function extractImageUrl(result) {
  if (result.data?.[0]?.url) return result.data[0].url;
  if (result.data?.[0]?.b64_json) return `data:image/png;base64,${result.data[0].b64_json}`;
  if (result.url) return result.url;
  if (result.images?.[0]?.url) return result.images[0].url;
  if (result.output?.image?.url) return result.output.image.url;
  return null;
}

async function generateImageDirect(request) {
  const { prompt, model, size, aspect_ratio, reference_images, extra_params } = request || {};
  const provider = resolveProviderFromModel(model);
  if (!provider) throw new Error(`未知的模型供应商: ${model}`);

  const providerConfig = await getProviderApiKey(provider);
  if (!providerConfig) throw new Error(`供应商 ${provider} 未配置 API Key，请联系管理员`);

  const endpoint = providerConfig.base_url || getProviderEndpoint(provider);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${providerConfig.api_key}` },
    body: JSON.stringify({ model, prompt, size, aspect_ratio, image: reference_images?.[0] || undefined, ...extra_params }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`供应商错误: ${errorText}`);
  }

  const result = await response.json();
  const imageUrl = extractImageUrl(result);
  if (!imageUrl) throw new Error('供应商未返回图片');

  const imgResp = await fetch(imageUrl);
  const imgBuffer = await imgResp.arrayBuffer();
  const base64 = Buffer.from(imgBuffer).toString('base64');
  return `data:image/png;base64,${base64}`;
}

handleCommand('set_api_key', async () => {
  // No-op on server side - API keys are managed by admin
  return null;
});

handleCommand('generate_image', async ({ request }, user) => {
  const provider = resolveProviderFromModel(request.model);
  const cost = deductCredits(user.id, request.model);
  try {
    const result = await generateImageDirect(request);
    logAiUsage(user.id, provider || 'unknown', request.model, cost, 'succeeded');
    return result;
  } catch (error) {
    // Refund on failure
    const ts = nowMs();
    const current = db.prepare('SELECT credits FROM users WHERE id = ?').get(user.id);
    db.prepare('UPDATE users SET credits = ?, updated_at = ? WHERE id = ?').run(current.credits + cost, ts, user.id);
    db.prepare(`
      INSERT INTO credit_transactions (id, user_id, amount, balance_before, balance_after, type, reference, note, created_at)
      VALUES (?, ?, ?, ?, ?, 'refund', ?, ?, ?)
    `).run(uuidv4(), user.id, cost, current.credits, current.credits + cost, request.model, `生成失败退款: ${error.message}`, ts);
    logAiUsage(user.id, provider || 'unknown', request.model, 0, 'failed');
    throw error;
  }
}, { auth: true });

handleCommand('submit_generate_image_job', async ({ request }, user) => {
  const provider = resolveProviderFromModel(request.model);
  const cost = deductCredits(user.id, request.model);
  const jobId = uuidv4();

  // Store job as running
  db.exec(`CREATE TABLE IF NOT EXISTS ai_generation_jobs (job_id TEXT PRIMARY KEY, provider_id TEXT, status TEXT, result TEXT, error TEXT, created_at INTEGER, updated_at INTEGER)`);
  db.prepare('INSERT INTO ai_generation_jobs (job_id, provider_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(jobId, provider || 'unknown', 'running', nowMs(), nowMs());

  // Execute async
  generateImageDirect(request).then(result => {
    db.prepare('UPDATE ai_generation_jobs SET status = ?, result = ?, updated_at = ? WHERE job_id = ?').run('succeeded', result, nowMs(), jobId);
    logAiUsage(user.id, provider || 'unknown', request.model, cost, 'succeeded');
  }).catch(error => {
    db.prepare('UPDATE ai_generation_jobs SET status = ?, error = ?, updated_at = ? WHERE job_id = ?').run('failed', error.message, nowMs(), jobId);
    logAiUsage(user.id, provider || 'unknown', request.model, 0, 'failed');
    // Refund
    const ts = nowMs();
    const current = db.prepare('SELECT credits FROM users WHERE id = ?').get(user.id);
    db.prepare('UPDATE users SET credits = ?, updated_at = ? WHERE id = ?').run(current.credits + cost, ts, user.id);
    db.prepare(`INSERT INTO credit_transactions (id, user_id, amount, balance_before, balance_after, type, reference, note, created_at) VALUES (?, ?, ?, ?, ?, 'refund', ?, ?, ?)`).run(uuidv4(), user.id, cost, current.credits, current.credits + cost, request.model, '异步生成失败退款', ts);
  });

  return jobId;
}, { auth: true });

handleCommand('get_generate_image_job', async ({ jobId }) => {
  const job = db.prepare('SELECT * FROM ai_generation_jobs WHERE job_id = ?').get(jobId);
  if (!job) return { job_id: jobId, status: 'not_found', result: null, error: 'job not found' };
  return { job_id: job.job_id, status: job.status, result: job.result || null, error: job.error || null };
}, { auth: true });

// ==================== SYSTEM ====================

handleCommand('get_runtime_system_info', async () => {
  return { osName: process.platform, osVersion: process.version, osBuild: 'web-server' };
});

handleCommand('check_latest_release_tag', async () => {
  try {
    const resp = await fetch('https://api.github.com/repos/henjicc/Storyboard-Copilot/releases/latest');
    if (!resp.ok) return null;
    return (await resp.json()).tag_name || null;
  } catch { return null; }
});

handleCommand('frontend_ready', async () => null);

// ==================== STATIC FILES ====================

app.use('/images', express.static(IMAGES_DIR));

if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/images/')) return next();
    res.sendFile(join(DIST_DIR, 'index.html'));
  });
  console.log(`Serving frontend from ${DIST_DIR}`);
}

// ==================== START ====================

app.listen(PORT, () => {
  console.log(`\nStoryboard Copilot Server running on http://localhost:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Admin: username=admin, password=${DEFAULT_ADMIN_PASSWORD}\n`);
});
