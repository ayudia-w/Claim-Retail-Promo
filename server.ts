import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import Database from 'better-sqlite3';
import type {
  AuditAction,
  AuditLogEntry,
  AuthUser,
  ClaimMode,
  DiscountType,
  Memo,
  MemoComment,
  MemoItem,
  MemoStatus,
  UserRole,
} from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'promoclaim.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeAndMigrateSchema() {
  const existingMemosTable = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='memos'")
    .get() as { sql?: string } | undefined;

  if (!existingMemosTable) {
    db.exec(`
      CREATE TABLE memos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memo_number TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('potongan', 'rafraksi', 'mixed')),
        supplier TEXT NOT NULL DEFAULT '',
        periode_start TEXT NOT NULL DEFAULT '',
        periode_end TEXT NOT NULL DEFAULT '',
        no_kontrak TEXT NOT NULL DEFAULT '',
        source_filename TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'verified')),
        printed_at TEXT NOT NULL DEFAULT '',
        printed_by TEXT NOT NULL DEFAULT '',
        print_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE memo_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memo_id INTEGER NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
        row_order INTEGER NOT NULL DEFAULT 0,
        kode TEXT NOT NULL DEFAULT '',
        nama TEXT NOT NULL DEFAULT '',
        qty REAL NOT NULL DEFAULT 0,
        discount_type TEXT NOT NULL DEFAULT 'potongan' CHECK (discount_type IN ('potongan', 'rafraksi')),
        diskon_satuan REAL NOT NULL DEFAULT 0,
        harga_satuan REAL NOT NULL DEFAULT 0,
        rafraksi_pct REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE memo_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memo_id INTEGER NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
        author TEXT NOT NULL DEFAULT 'Admin',
        comment TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memo_id INTEGER REFERENCES memos(id) ON DELETE SET NULL,
        memo_number TEXT NOT NULL DEFAULT '',
        item_id INTEGER,
        item_kode TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL,
        field_name TEXT NOT NULL DEFAULT '',
        old_value TEXT NOT NULL DEFAULT '',
        new_value TEXT NOT NULL DEFAULT '',
        actor TEXT NOT NULL DEFAULT 'Admin',
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
    `);
  } else {
    // Migrate legacy schema if 'mixed' or 'rafraksi_pct' is not yet present
    const needsMixedUpgrade = !existingMemosTable.sql?.includes("'mixed'");
    if (needsMixedUpgrade) {
      db.pragma('foreign_keys = OFF');
      const migrateTx = db.transaction(() => {
        db.exec(`
          CREATE TABLE memos_v2 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            memo_number TEXT NOT NULL,
            mode TEXT NOT NULL CHECK (mode IN ('potongan', 'rafraksi', 'mixed')),
            supplier TEXT NOT NULL DEFAULT '',
            periode_start TEXT NOT NULL DEFAULT '',
            periode_end TEXT NOT NULL DEFAULT '',
            no_kontrak TEXT NOT NULL DEFAULT '',
            source_filename TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'verified')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );

          INSERT INTO memos_v2
          SELECT id, memo_number, mode, supplier, periode_start, periode_end,
                 no_kontrak, source_filename, status, created_at, updated_at
          FROM memos;

          CREATE TABLE memo_items_v2 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            memo_id INTEGER NOT NULL REFERENCES memos_v2(id) ON DELETE CASCADE,
            row_order INTEGER NOT NULL DEFAULT 0,
            kode TEXT NOT NULL DEFAULT '',
            nama TEXT NOT NULL DEFAULT '',
            qty REAL NOT NULL DEFAULT 0,
            discount_type TEXT NOT NULL DEFAULT 'potongan' CHECK (discount_type IN ('potongan', 'rafraksi')),
            diskon_satuan REAL NOT NULL DEFAULT 0,
            harga_satuan REAL NOT NULL DEFAULT 0,
            rafraksi_pct REAL NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );

          INSERT INTO memo_items_v2 (
            id, memo_id, row_order, kode, nama, qty, discount_type,
            diskon_satuan, harga_satuan, rafraksi_pct, created_at, updated_at
          )
          SELECT
            mi.id,
            mi.memo_id,
            mi.row_order,
            SUBSTR(mi.kode, 1, 6),
            mi.nama,
            mi.qty,
            CASE WHEN m.mode = 'rafraksi' THEN 'rafraksi' ELSE 'potongan' END,
            CASE WHEN m.mode = 'rafraksi' THEN 0 ELSE mi.diskon_satuan END,
            CASE WHEN m.mode = 'rafraksi' THEN mi.harga_satuan ELSE 0 END,
            CASE
              WHEN m.mode = 'rafraksi' AND (mi.qty * mi.harga_satuan) > 0
              THEN ROUND((mi.rafraksi / (mi.qty * mi.harga_satuan)) * 100.0, 4)
              ELSE 0
            END,
            mi.created_at,
            mi.updated_at
          FROM memo_items mi
          JOIN memos m ON m.id = mi.memo_id;

          DROP TABLE memo_items;
          DROP TABLE memos;
          ALTER TABLE memos_v2 RENAME TO memos;
          ALTER TABLE memo_items_v2 RENAME TO memo_items;
        `);
      });
      migrateTx();
      db.pragma('foreign_keys = ON');
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS memo_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memo_id INTEGER NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
        author TEXT NOT NULL DEFAULT 'Admin',
        comment TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  // Ensure print tracking columns exist on existing databases
  const memoCols = db.prepare('PRAGMA table_info(memos)').all() as Array<{ name: string }>;
  const memoColNames = new Set(memoCols.map((c) => c.name));
  if (!memoColNames.has('printed_at')) {
    db.exec("ALTER TABLE memos ADD COLUMN printed_at TEXT NOT NULL DEFAULT ''");
  }
  if (!memoColNames.has('printed_by')) {
    db.exec("ALTER TABLE memos ADD COLUMN printed_by TEXT NOT NULL DEFAULT ''");
  }
  if (!memoColNames.has('print_count')) {
    db.exec('ALTER TABLE memos ADD COLUMN print_count INTEGER NOT NULL DEFAULT 0');
  }

  // Normalize legacy 'claimed' status and purge obsolete import/status/reset logs from Riwayat
  db.exec(`
    UPDATE memos SET status = 'verified' WHERE status = 'claimed';
    DELETE FROM audit_logs WHERE action IN ('IMPORT', 'UPDATE_STATUS', 'RESET_DEMO');

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'audit')),
      password_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memos_created_at ON memos(created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_memos_status ON memos(status);
    CREATE INDEX IF NOT EXISTS idx_memo_items_memo_id ON memo_items(memo_id);
    CREATE INDEX IF NOT EXISTS idx_memo_comments_memo_id ON memo_comments(memo_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_memo_id ON audit_logs(memo_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `);
}

initializeAndMigrateSchema();

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

interface UserRow {
  id: number;
  username: string;
  display_name: string;
  role: UserRole;
  password_hash: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  tokenHash?: string;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  try {
    const expected = Buffer.from(expectedHex, 'hex');
    const derived = crypto.scryptSync(password, salt, 64);
    if (expected.length !== derived.length) return false;
    return crypto.timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

function safeTimingEqualStrings(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function hashSessionToken(rawToken: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(rawToken).digest('hex');
}

function createSessionToken(userId: number): string {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).run(tokenHash, userId, expiresAt, now.toISOString());
  return rawToken;
}

function toAuthUser(row: Pick<UserRow, 'id' | 'username' | 'display_name' | 'role' | 'is_active' | 'created_at'>): AuthUser {
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    role: row.role,
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
  };
}

function cleanUsername(val: unknown): string {
  if (typeof val !== 'string') return '';
  return val
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, 40);
}

function isValidRole(val: unknown): val is UserRole {
  return val === 'admin' || val === 'audit';
}

function getActiveAdminCount(): number {
  const row = db
    .prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = 1")
    .get() as { count: number };
  return row.count;
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Sesi tidak ditemukan. Silakan log in kembali.' });
    return;
  }

  const rawToken = authHeader.slice(7).trim();
  if (!rawToken) {
    res.status(401).json({ error: 'Token tidak valid.' });
    return;
  }

  const tokenHash = hashSessionToken(rawToken);
  const session = db
    .prepare(
      `SELECT s.token_hash, s.expires_at,
              u.id, u.username, u.display_name, u.role, u.is_active, u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as
    | (Pick<UserRow, 'id' | 'username' | 'display_name' | 'role' | 'is_active' | 'created_at'> & {
        token_hash: string;
        expires_at: string;
      })
    | undefined;

  if (!session) {
    res.status(401).json({ error: 'Sesi berakhir atau tidak valid.' });
    return;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    res.status(401).json({ error: 'Sesi sudah kedaluwarsa. Silakan log in kembali.' });
    return;
  }

  if (!session.is_active) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    res.status(403).json({ error: 'Akun user dinonaktifkan.' });
    return;
  }

  req.user = toAuthUser(session);
  req.tokenHash = tokenHash;
  next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Hanya Admin yang dapat mengelola user.' });
    return;
  }
  next();
}

function getActorName(req: AuthenticatedRequest): string {
  return req.user?.display_name || req.user?.username || 'Admin';
}

function canAccessMemo(memo: { status: MemoStatus }, role: UserRole): boolean {
  return role === 'admin' || memo.status !== 'draft';
}

function cleanText(val: unknown, maxLen = 240): string {
  if (typeof val !== 'string') {
    if (typeof val === 'number' && Number.isFinite(val)) return String(val);
    return '';
  }
  return val.trim().slice(0, maxLen);
}

function cleanKode6(val: unknown): string {
  const str = cleanText(val, 24);
  const digits = str.replace(/\D/g, '');
  if (digits.length > 0) return digits.slice(0, 6);
  return str.slice(0, 6);
}

function cleanNumber(val: unknown, fallback = 0): number {
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num)) return fallback;
  return num;
}

function isValidMode(val: unknown): val is ClaimMode {
  return val === 'potongan' || val === 'rafraksi' || val === 'mixed';
}

function isValidDiscountType(val: unknown): val is DiscountType {
  return val === 'potongan' || val === 'rafraksi';
}

function isValidStatus(val: unknown): val is MemoStatus {
  return val === 'draft' || val === 'verified';
}

const stmtInsertMemo = db.prepare(`
  INSERT INTO memos (
    memo_number, mode, supplier, periode_start, periode_end,
    no_kontrak, source_filename, status, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtInsertItem = db.prepare(`
  INSERT INTO memo_items (
    memo_id, row_order, kode, nama, qty, discount_type,
    diskon_satuan, harga_satuan, rafraksi_pct, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtInsertComment = db.prepare(`
  INSERT INTO memo_comments (memo_id, author, comment, created_at)
  VALUES (?, ?, ?, ?)
`);

const stmtInsertAudit = db.prepare(`
  INSERT INTO audit_logs (
    memo_id, memo_number, item_id, item_kode, action, field_name,
    old_value, new_value, actor, note, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtGetMemoRow = db.prepare('SELECT * FROM memos WHERE id = ?');
const stmtGetMemoItems = db.prepare(
  'SELECT * FROM memo_items WHERE memo_id = ? ORDER BY row_order ASC, id ASC'
);
const stmtGetMemoComments = db.prepare(
  'SELECT * FROM memo_comments WHERE memo_id = ? ORDER BY created_at ASC, id ASC'
);
const stmtGetMemoAuditLogs = db.prepare(
  "SELECT * FROM audit_logs WHERE memo_id = ? AND action NOT IN ('IMPORT', 'UPDATE_STATUS', 'RESET_DEMO') ORDER BY id DESC"
);

const stmtGetAllMemosAdmin = db.prepare('SELECT * FROM memos ORDER BY created_at DESC, id DESC');
const stmtGetAllMemosAudit = db.prepare(
  "SELECT * FROM memos WHERE status != 'draft' ORDER BY created_at DESC, id DESC"
);
const stmtGetAllItemsAdmin = db.prepare('SELECT * FROM memo_items ORDER BY row_order ASC, id ASC');
const stmtGetAllItemsAudit = db.prepare(
  "SELECT * FROM memo_items WHERE memo_id IN (SELECT id FROM memos WHERE status != 'draft') ORDER BY row_order ASC, id ASC"
);
const stmtGetAllCommentsAdmin = db.prepare(
  'SELECT * FROM memo_comments ORDER BY created_at ASC, id ASC'
);
const stmtGetAllCommentsAudit = db.prepare(
  "SELECT * FROM memo_comments WHERE memo_id IN (SELECT id FROM memos WHERE status != 'draft') ORDER BY created_at ASC, id ASC"
);
const stmtGetAllLogsAdmin = db.prepare(
  "SELECT * FROM audit_logs WHERE memo_id IS NOT NULL AND action NOT IN ('IMPORT', 'UPDATE_STATUS', 'RESET_DEMO') ORDER BY id DESC"
);
const stmtGetAllLogsAudit = db.prepare(
  "SELECT * FROM audit_logs WHERE memo_id IS NOT NULL AND memo_id IN (SELECT id FROM memos WHERE status != 'draft') AND action NOT IN ('IMPORT', 'UPDATE_STATUS', 'RESET_DEMO') ORDER BY id DESC"
);

const stmtTouchMemo = db.prepare('UPDATE memos SET updated_at = ? WHERE id = ?');
const stmtDeleteMemo = db.prepare('DELETE FROM memos WHERE id = ?');
const stmtGetItemById = db.prepare('SELECT * FROM memo_items WHERE id = ?');
const stmtGetCommentById = db.prepare('SELECT * FROM memo_comments WHERE id = ?');
const stmtUpdateMemoHeader = db.prepare(`
  UPDATE memos SET
    memo_number = ?, supplier = ?, periode_start = ?,
    periode_end = ?, no_kontrak = ?, status = ?, updated_at = ?
  WHERE id = ?
`);
const stmtUpdateMemoBulk = db.prepare(`
  UPDATE memos SET
    supplier = ?, periode_start = ?, periode_end = ?,
    no_kontrak = ?, status = ?, updated_at = ?
  WHERE id = ?
`);
const stmtMarkMemoPrinted = db.prepare(
  'UPDATE memos SET printed_at = ?, printed_by = ?, print_count = ? WHERE id = ?'
);

function insertAudit(params: {
  memoId: number | null;
  memoNumber: string;
  itemId?: number | null;
  itemKode?: string;
  action: AuditAction;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  actor?: string;
  note?: string;
  createdAt?: string;
}) {
  stmtInsertAudit.run(
    params.memoId,
    params.memoNumber,
    params.itemId ?? null,
    params.itemKode ?? '',
    params.action,
    params.fieldName ?? '',
    params.oldValue ?? '',
    params.newValue ?? '',
    cleanText(params.actor, 80) || 'Admin',
    cleanText(params.note, 300),
    params.createdAt ?? new Date().toISOString()
  );
}

function seedDemoData(reset = false) {
  const existingCount = db.prepare('SELECT COUNT(*) as count FROM memos').get() as {
    count: number;
  };
  const hasLegacySeed = db
    .prepare("SELECT COUNT(*) as count FROM memo_items WHERE kode = '899886'")
    .get() as { count: number };

  if (!reset && existingCount.count > 0 && hasLegacySeed.count === 0) return;

  const seedTx = db.transaction(() => {
    if (reset || hasLegacySeed.count > 0) {
      db.prepare('DELETE FROM memo_comments').run();
      db.prepare('DELETE FROM memo_items').run();
      db.prepare('DELETE FROM memos').run();
      if (hasLegacySeed.count > 0 && !reset) {
        db.prepare('DELETE FROM audit_logs').run();
      }
    }

    const now = new Date().toISOString();

    const m1 = stmtInsertMemo.run(
      'PM0801',
      'potongan',
      'PT Indofood CBP Sukses Makmur',
      '01 Aug 2026',
      '15 Aug 2026',
      'KTR/IND/08/2026',
      'PM0801_indofood_w1.xlsx',
      'verified',
      now,
      now
    );
    const m1Id = Number(m1.lastInsertRowid);
    const m1Items = [
      ['104821', 'Indomie Goreng Special 85g', 420, 350, 3100],
      ['104822', 'Indomie Soto Mie 70g', 280, 300, 3000],
      ['104835', 'Pop Mie Rasa Ayam 75g', 165, 500, 5200],
      ['104912', 'Chitato Sapi Panggang 68g', 190, 1200, 11500],
    ] as const;
    m1Items.forEach(([kode, nama, qty, diskon, harga], idx) => {
      stmtInsertItem.run(m1Id, idx, kode, nama, qty, 'potongan', diskon, harga, 0, now, now);
    });
    stmtInsertComment.run(
      m1Id,
      'Admin',
      'POS sellout verified against store branch totals; ready to print.',
      now
    );

    const m2 = stmtInsertMemo.run(
      'PM0802',
      'potongan',
      'PT Indofood CBP Sukses Makmur',
      '16 Aug 2026',
      '31 Aug 2026',
      'KTR/IND/08/2026',
      'PM0802_indofood_w2.xlsx',
      'draft',
      now,
      now
    );
    const m2Id = Number(m2.lastInsertRowid);
    const m2Items = [
      ['104821', 'Indomie Goreng Special 85g', 360, 350, 3100],
      ['104912', 'Chitato Sapi Panggang 68g', 210, 1200, 11500],
      ['105201', 'Indomilk UHT Cokelat 250ml', 310, 750, 6500],
    ] as const;
    m2Items.forEach(([kode, nama, qty, diskon, harga], idx) => {
      stmtInsertItem.run(m2Id, idx, kode, nama, qty, 'potongan', diskon, harga, 0, now, now);
    });

    const m3 = stmtInsertMemo.run(
      'RF0814',
      'rafraksi',
      'PT Unilever Indonesia Tbk',
      '01 Aug 2026',
      '31 Aug 2026',
      'KTR/UNV/RAF-08',
      'RF0814_unilever_rafraksi.xlsx',
      'draft',
      now,
      now
    );
    const m3Id = Number(m3.lastInsertRowid);
    const m3Items = [
      ['208412', 'Lifebuoy Body Wash Total 450ml', 140, 28500, 10],
      ['208778', 'Sunsilk Black Shine 340ml', 95, 34000, 15],
      ['209105', 'Pepsodent Herbal 190g', 220, 16500, 10],
    ] as const;
    m3Items.forEach(([kode, nama, qty, harga, pct], idx) => {
      stmtInsertItem.run(m3Id, idx, kode, nama, qty, 'rafraksi', 0, harga, pct, now, now);
    });

    const m4 = stmtInsertMemo.run(
      'MX0820',
      'mixed',
      'PT Mayora Indah Tbk',
      '01 Aug 2026',
      '31 Aug 2026',
      'KTR/MYR/MIX-08',
      'MX0820_mayora_mixed.xlsx',
      'draft',
      now,
      now
    );
    const m4Id = Number(m4.lastInsertRowid);
    stmtInsertItem.run(m4Id, 0, '301104', 'Torabika Creamy Latte 10s', 180, 'potongan', 800, 18500, 0, now, now);
    stmtInsertItem.run(m4Id, 1, '301219', 'Kopiko Blister 24g', 250, 'potongan', 400, 9000, 0, now, now);
    stmtInsertItem.run(m4Id, 2, '304512', 'Roma Malkist Crackers 135g', 160, 'rafraksi', 0, 9500, 10, now, now);
    stmtInsertItem.run(m4Id, 3, '304880', 'Beng-Beng Share It 95g', 110, 'rafraksi', 0, 14000, 12, now, now);
    stmtInsertComment.run(
      m4Id,
      'Admin',
      'Beverage SKUs use Rp/unit Potongan; biscuit/wafer SKUs use Rafraksi %.',
      now
    );

  });

  seedTx();
}

seedDemoData(false);

type RawMemoRow = Omit<Memo, 'items' | 'comments' | 'audit_logs'>;

function groupByMemoId<T extends { memo_id: number | null }>(rows: T[]): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const row of rows) {
    if (row.memo_id === null) continue;
    let list = map.get(row.memo_id);
    if (!list) {
      list = [];
      map.set(row.memo_id, list);
    }
    list.push(row);
  }
  return map;
}

function hydrateMemos(
  memos: RawMemoRow[],
  items: MemoItem[],
  comments: MemoComment[],
  auditLogs: AuditLogEntry[]
): Memo[] {
  const itemsByMemo = groupByMemoId(items);
  const commentsByMemo = groupByMemoId(comments);
  const logsByMemo = groupByMemoId(auditLogs);

  return memos.map((m) => ({
    ...m,
    printed_at: m.printed_at ?? '',
    printed_by: m.printed_by ?? '',
    print_count: Number(m.print_count ?? 0),
    items: itemsByMemo.get(m.id) ?? [],
    comments: commentsByMemo.get(m.id) ?? [],
    audit_logs: logsByMemo.get(m.id) ?? [],
  }));
}

function fetchAllMemos(role: UserRole = 'admin'): Memo[] {
  const memos = (
    role === 'audit' ? stmtGetAllMemosAudit.all() : stmtGetAllMemosAdmin.all()
  ) as RawMemoRow[];
  const items = (
    role === 'audit' ? stmtGetAllItemsAudit.all() : stmtGetAllItemsAdmin.all()
  ) as MemoItem[];
  const comments = (
    role === 'audit' ? stmtGetAllCommentsAudit.all() : stmtGetAllCommentsAdmin.all()
  ) as MemoComment[];
  const auditLogs = (
    role === 'audit' ? stmtGetAllLogsAudit.all() : stmtGetAllLogsAdmin.all()
  ) as AuditLogEntry[];

  return hydrateMemos(memos, items, comments, auditLogs);
}

function fetchMemoById(memoId: number): Memo | null {
  const memo = stmtGetMemoRow.get(memoId) as RawMemoRow | undefined;
  if (!memo) return null;
  const items = stmtGetMemoItems.all(memoId) as MemoItem[];
  const comments = stmtGetMemoComments.all(memoId) as MemoComment[];
  const audit_logs = stmtGetMemoAuditLogs.all(memoId) as AuditLogEntry[];
  return {
    ...memo,
    printed_at: memo.printed_at ?? '',
    printed_by: memo.printed_by ?? '',
    print_count: Number(memo.print_count ?? 0),
    items,
    comments,
    audit_logs,
  };
}

function fetchMemoRowsByIds(ids: number[]): RawMemoRow[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  return db
    .prepare(`SELECT * FROM memos WHERE id IN (${placeholders})`)
    .all(...ids) as RawMemoRow[];
}

function fetchMemosByIds(ids: number[]): Memo[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const memos = db
    .prepare(`SELECT * FROM memos WHERE id IN (${placeholders})`)
    .all(...ids) as RawMemoRow[];
  if (memos.length === 0) return [];
  const items = db
    .prepare(`SELECT * FROM memo_items WHERE memo_id IN (${placeholders}) ORDER BY row_order ASC, id ASC`)
    .all(...ids) as MemoItem[];
  const comments = db
    .prepare(`SELECT * FROM memo_comments WHERE memo_id IN (${placeholders}) ORDER BY created_at ASC, id ASC`)
    .all(...ids) as MemoComment[];
  const logs = db
    .prepare(
      `SELECT * FROM audit_logs WHERE memo_id IN (${placeholders}) AND action NOT IN ('IMPORT', 'UPDATE_STATUS', 'RESET_DEMO') ORDER BY id DESC`
    )
    .all(...ids) as AuditLogEntry[];

  const hydrated = hydrateMemos(memos, items, comments, logs);
  const byId = new Map(hydrated.map((m) => [m.id, m]));
  return ids.map((id) => byId.get(id)).filter((m): m is Memo => m !== undefined);
}

const app = express();
app.use(express.json({ limit: '15mb' }));

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, database: 'sqlite-local' });
});

app.get('/api/auth/status', (_req: Request, res: Response) => {
  res.json({
    initialized: getActiveAdminCount() > 0,
    passcodeEnabled: Boolean(process.env.ADMIN_PASSCODE?.trim()),
  });
});

app.post('/api/auth/bootstrap', (req: Request, res: Response) => {
  try {
    if (getActiveAdminCount() > 0) {
      res.status(409).json({ error: 'Akun admin sudah dibuat. Silakan log in.' });
      return;
    }

    const body = req.body as {
      admin?: { username?: string; display_name?: string; password?: string };
      audit?: { username?: string; display_name?: string; password?: string };
    };

    const adminUsername = cleanUsername(body.admin?.username);
    const adminDisplay = cleanText(body.admin?.display_name, 80) || adminUsername;
    const adminPassword = typeof body.admin?.password === 'string' ? body.admin.password : '';

    if (adminUsername.length < 2) {
      res.status(400).json({ error: 'Username Admin minimal 2 karakter (huruf/angka).' });
      return;
    }
    if (adminPassword.length < 6) {
      res.status(400).json({ error: 'Password Admin minimal 6 karakter.' });
      return;
    }

    const auditUsername = cleanUsername(body.audit?.username);
    const auditDisplay = cleanText(body.audit?.display_name, 80) || auditUsername;
    const auditPassword = typeof body.audit?.password === 'string' ? body.audit.password : '';
    const createAuditUser = Boolean(auditUsername || auditPassword);

    if (createAuditUser) {
      if (auditUsername.length < 2) {
        res.status(400).json({ error: 'Username Audit minimal 2 karakter.' });
        return;
      }
      if (auditUsername === adminUsername) {
        res.status(400).json({ error: 'Username Audit harus berbeda dengan Admin.' });
        return;
      }
      if (auditPassword.length < 6) {
        res.status(400).json({ error: 'Password Audit minimal 6 karakter.' });
        return;
      }
    }

    const now = new Date().toISOString();
    const bootstrapTx = db.transaction(() => {
      const adminInsert = db
        .prepare(
          `INSERT INTO users (username, display_name, role, password_hash, is_active, created_at, updated_at)
           VALUES (?, ?, 'admin', ?, 1, ?, ?)`
        )
        .run(adminUsername, adminDisplay, hashPassword(adminPassword), now, now);

      const adminId = Number(adminInsert.lastInsertRowid);

      if (createAuditUser) {
        db.prepare(
          `INSERT INTO users (username, display_name, role, password_hash, is_active, created_at, updated_at)
           VALUES (?, ?, 'audit', ?, 1, ?, ?)`
        ).run(auditUsername, auditDisplay, hashPassword(auditPassword), now, now);
      }

      return adminId;
    });

    const adminId = bootstrapTx();
    const userRow = db
      .prepare('SELECT id, username, display_name, role, is_active, created_at FROM users WHERE id = ?')
      .get(adminId) as UserRow;
    const token = createSessionToken(adminId);

    res.status(201).json({ token, user: toAuthUser(userRow) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal membuat akun awal' });
  }
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  try {
    const body = req.body as { username?: string; password?: string };
    const username = cleanUsername(body.username);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || !password) {
      res.status(400).json({ error: 'Username dan password wajib diisi.' });
      return;
    }

    const envPasscode = process.env.ADMIN_PASSCODE?.trim();
    const userRow = db
      .prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)')
      .get(username) as UserRow | undefined;

    if (!userRow) {
      if (envPasscode && getActiveAdminCount() === 0 && safeTimingEqualStrings(password, envPasscode)) {
        const now = new Date().toISOString();
        const info = db
          .prepare(
            `INSERT INTO users (username, display_name, role, password_hash, is_active, created_at, updated_at)
             VALUES (?, ?, 'admin', ?, 1, ?, ?)`
          )
          .run(username, username, hashPassword(password), now, now);
        const createdId = Number(info.lastInsertRowid);
        const createdRow = db
          .prepare('SELECT id, username, display_name, role, is_active, created_at FROM users WHERE id = ?')
          .get(createdId) as UserRow;
        const token = createSessionToken(createdId);
        res.json({ token, user: toAuthUser(createdRow) });
        return;
      }
      res.status(401).json({ error: 'Username atau password salah.' });
      return;
    }

    if (!userRow.is_active) {
      res.status(403).json({ error: 'Akun ini sedang dinonaktifkan oleh Admin.' });
      return;
    }

    const matchesStored = verifyPassword(password, userRow.password_hash);
    const matchesEnvPasscode =
      Boolean(envPasscode) &&
      userRow.role === 'admin' &&
      safeTimingEqualStrings(password, envPasscode!);

    if (!matchesStored && !matchesEnvPasscode) {
      res.status(401).json({ error: 'Username atau password salah.' });
      return;
    }

    const token = createSessionToken(userRow.id);
    res.json({ token, user: toAuthUser(userRow) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal log in' });
  }
});

app.post('/api/auth/logout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (req.tokenHash) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.tokenHash);
  }
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user });
});

app.get('/api/users', requireAuth, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const rows = db
    .prepare(
      'SELECT id, username, display_name, role, is_active, created_at FROM users ORDER BY id ASC'
    )
    .all() as UserRow[];
  res.json({ users: rows.map(toAuthUser) });
});

app.post('/api/users', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body as {
      username?: string;
      display_name?: string;
      role?: UserRole;
      password?: string;
    };
    const username = cleanUsername(body.username);
    const displayName = cleanText(body.display_name, 80) || username;
    const role: UserRole = isValidRole(body.role) ? body.role : 'audit';
    const password = typeof body.password === 'string' ? body.password : '';

    if (username.length < 2) {
      res.status(400).json({ error: 'Username minimal 2 karakter (huruf/angka).' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password minimal 6 karakter.' });
      return;
    }

    const existing = db
      .prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)')
      .get(username);
    if (existing) {
      res.status(409).json({ error: 'Username sudah digunakan.' });
      return;
    }

    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO users (username, display_name, role, password_hash, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`
      )
      .run(username, displayName, role, hashPassword(password), now, now);

    const created = db
      .prepare('SELECT id, username, display_name, role, is_active, created_at FROM users WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as UserRow;
    res.status(201).json({ user: toAuthUser(created) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal menambah user' });
  }
});

app.patch('/api/users/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(400).json({ error: 'ID user tidak valid.' });
      return;
    }

    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as
      | UserRow
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'User tidak ditemukan.' });
      return;
    }

    const body = req.body as {
      display_name?: string;
      role?: UserRole;
      is_active?: boolean;
      password?: string;
    };

    const nextDisplayName =
      body.display_name !== undefined
        ? cleanText(body.display_name, 80) || existing.display_name
        : existing.display_name;
    const nextRole: UserRole =
      body.role !== undefined && isValidRole(body.role) ? body.role : existing.role;
    const nextActive = body.is_active !== undefined ? (body.is_active ? 1 : 0) : existing.is_active;

    if (existing.role === 'admin' && existing.is_active === 1) {
      if ((nextRole !== 'admin' || nextActive === 0) && getActiveAdminCount() <= 1) {
        res.status(400).json({ error: 'Minimal harus ada satu Admin aktif.' });
        return;
      }
      if (req.user?.id === userId && nextActive === 0) {
        res.status(400).json({ error: 'Tidak dapat menonaktifkan akun yang sedang dipakai.' });
        return;
      }
    }

    let nextPasswordHash = existing.password_hash;
    let passwordChanged = false;
    if (typeof body.password === 'string' && body.password.length > 0) {
      if (body.password.length < 6) {
        res.status(400).json({ error: 'Password baru minimal 6 karakter.' });
        return;
      }
      nextPasswordHash = hashPassword(body.password);
      passwordChanged = true;
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE users
       SET display_name = ?, role = ?, is_active = ?, password_hash = ?, updated_at = ?
       WHERE id = ?`
    ).run(nextDisplayName, nextRole, nextActive, nextPasswordHash, now, userId);

    if (nextActive === 0 || passwordChanged) {
      if (req.user?.id === userId && req.tokenHash) {
        db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(
          userId,
          req.tokenHash
        );
      } else {
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
      }
    }

    const updated = db
      .prepare('SELECT id, username, display_name, role, is_active, created_at FROM users WHERE id = ?')
      .get(userId) as UserRow;
    res.json({ user: toAuthUser(updated) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal mengubah user' });
  }
});

// Master Daftar Supplier (dibaca oleh semua user login; ditambah/ubah/hapus hanya oleh Admin)
app.get('/api/suppliers', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  try {
    const suppliers = db
      .prepare('SELECT id, name, created_at FROM suppliers ORDER BY name COLLATE NOCASE ASC')
      .all();
    res.json({ suppliers });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal memuat supplier' });
  }
});

app.post('/api/suppliers', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body as { name?: string };
    const name = cleanText(body.name, 160);
    if (!name) {
      res.status(400).json({ error: 'Nama supplier tidak boleh kosong.' });
      return;
    }

    const duplicate = db
      .prepare('SELECT id FROM suppliers WHERE LOWER(name) = LOWER(?)')
      .get(name);
    if (duplicate) {
      res.status(409).json({ error: 'Supplier sudah ada dalam daftar.' });
      return;
    }

    const now = new Date().toISOString();
    const info = db
      .prepare('INSERT INTO suppliers (name, created_at) VALUES (?, ?)')
      .run(name, now);
    const created = db
      .prepare('SELECT id, name, created_at FROM suppliers WHERE id = ?')
      .get(Number(info.lastInsertRowid));
    res.status(201).json({ supplier: created });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal menambah supplier' });
  }
});

app.patch('/api/suppliers/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const supplierId = Number(req.params.id);
    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      res.status(400).json({ error: 'ID supplier tidak valid.' });
      return;
    }

    const existing = db.prepare('SELECT id, name, created_at FROM suppliers WHERE id = ?').get(supplierId) as
      | { id: number; name: string; created_at: string }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Supplier tidak ditemukan.' });
      return;
    }

    const body = req.body as { name?: string };
    const name = cleanText(body.name, 160);
    if (!name) {
      res.status(400).json({ error: 'Nama supplier tidak boleh kosong.' });
      return;
    }

    const duplicate = db
      .prepare('SELECT id FROM suppliers WHERE LOWER(name) = LOWER(?) AND id != ?')
      .get(name, supplierId);
    if (duplicate) {
      res.status(409).json({ error: 'Nama supplier tersebut sudah digunakan.' });
      return;
    }

    db.prepare('UPDATE suppliers SET name = ? WHERE id = ?').run(name, supplierId);
    const updated = db
      .prepare('SELECT id, name, created_at FROM suppliers WHERE id = ?')
      .get(supplierId);
    res.json({ supplier: updated });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal mengubah supplier' });
  }
});

app.delete('/api/suppliers/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const supplierId = Number(req.params.id);
    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      res.status(400).json({ error: 'ID supplier tidak valid.' });
      return;
    }

    const info = db.prepare('DELETE FROM suppliers WHERE id = ?').run(supplierId);
    if (info.changes === 0) {
      res.status(404).json({ error: 'Supplier tidak ditemukan.' });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal menghapus supplier' });
  }
});

app.get('/api/memos', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ memos: fetchAllMemos(req.user!.role) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load memos' });
  }
});

app.post('/api/memos', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Hanya Admin yang dapat mengimpor file Excel.' });
      return;
    }

    const body = req.body as {
      note?: string;
      memos?: Array<{
        memo_number?: string;
        mode?: ClaimMode;
        supplier?: string;
        periode_start?: string;
        periode_end?: string;
        no_kontrak?: string;
        source_filename?: string;
        items?: Array<{
          kode?: string;
          nama?: string;
          qty?: number;
          discount_type?: DiscountType;
          diskon_satuan?: number;
          harga_satuan?: number;
          rafraksi_pct?: number;
        }>;
      }>;
    };

    const incoming = Array.isArray(body.memos) ? body.memos : [];
    if (incoming.length === 0) {
      res.status(400).json({ error: 'No memos provided' });
      return;
    }

    const actor = getActorName(req);
    const note = cleanText(body.note, 300);
    const now = new Date().toISOString();
    const initialStatus: MemoStatus = 'draft';

    const createTx = db.transaction(() => {
      const createdIds: number[] = [];
      for (const entry of incoming) {
        if (!isValidMode(entry.mode)) {
          throw new Error('Invalid claim mode (expected potongan, rafraksi, or mixed)');
        }
        const entryMode: ClaimMode = entry.mode;
        const memoNumber = cleanText(entry.memo_number, 64) || 'MEMO';
        const supplier = cleanText(entry.supplier, 160);
        const periodeStart = cleanText(entry.periode_start, 64);
        const periodeEnd = cleanText(entry.periode_end, 64);
        const noKontrak = cleanText(entry.no_kontrak, 120);
        const sourceFilename = cleanText(entry.source_filename, 200);

        const info = stmtInsertMemo.run(
          memoNumber,
          entryMode,
          supplier,
          periodeStart,
          periodeEnd,
          noKontrak,
          sourceFilename,
          initialStatus,
          now,
          now
        );
        const memoId = Number(info.lastInsertRowid);
        createdIds.push(memoId);

        const items = Array.isArray(entry.items) ? entry.items : [];
        items.forEach((item, idx) => {
          const itemDiscountType: DiscountType =
            entryMode === 'mixed'
              ? isValidDiscountType(item.discount_type)
                ? item.discount_type
                : 'potongan'
              : entryMode;

          const diskonSatuan =
            itemDiscountType === 'potongan' ? cleanNumber(item.diskon_satuan, 0) : 0;
          const hargaSatuan = cleanNumber(item.harga_satuan, 0);
          const rafraksiPct =
            itemDiscountType === 'rafraksi' ? cleanNumber(item.rafraksi_pct, 0) : 0;

          stmtInsertItem.run(
            memoId,
            idx,
            cleanKode6(item.kode),
            cleanText(item.nama, 240),
            cleanNumber(item.qty, 0),
            itemDiscountType,
            diskonSatuan,
            hargaSatuan,
            rafraksiPct,
            now,
            now
          );
        });

        if (!sourceFilename) {
          insertAudit({
            memoId,
            memoNumber,
            action: 'CREATE_MEMO',
            fieldName: 'memo',
            newValue: `${items.length} item(s) (${entry.mode})`,
            actor,
            note: note || 'Created manually',
            createdAt: now,
          });
        }
      }
      return createdIds;
    });

    const createdIds = createTx();
    const createdMemos = fetchMemosByIds(createdIds);

    res.status(201).json({ memos: createdMemos });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create memo' });
  }
});

app.patch('/api/memos/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const memoId = Number(req.params.id);
    if (!Number.isInteger(memoId) || memoId <= 0) {
      res.status(400).json({ error: 'Invalid memo id' });
      return;
    }

    const existing = fetchMemoById(memoId);
    if (!existing) {
      res.status(404).json({ error: 'Memo not found' });
      return;
    }
    if (!canAccessMemo(existing, req.user!.role)) {
      res.status(403).json({ error: 'Memo belum diverifikasi oleh Admin.' });
      return;
    }

    const body = req.body as {
      memo_number?: string;
      supplier?: string;
      periode_start?: string;
      periode_end?: string;
      no_kontrak?: string;
      status?: MemoStatus;
      note?: string;
    };

    if (req.user!.role === 'audit' && body.status === 'draft') {
      res.status(403).json({ error: 'Audit tidak dapat mengubah memo menjadi belum diverifikasi.' });
      return;
    }

    const actor = getActorName(req);
    const note = cleanText(body.note, 300);
    const now = new Date().toISOString();

    const nextValues = {
      memo_number:
        body.memo_number !== undefined
          ? cleanText(body.memo_number, 64) || existing.memo_number
          : existing.memo_number,
      supplier:
        body.supplier !== undefined ? cleanText(body.supplier, 160) : existing.supplier,
      periode_start:
        body.periode_start !== undefined
          ? cleanText(body.periode_start, 64)
          : existing.periode_start,
      periode_end:
        body.periode_end !== undefined
          ? cleanText(body.periode_end, 64)
          : existing.periode_end,
      no_kontrak:
        body.no_kontrak !== undefined
          ? cleanText(body.no_kontrak, 120)
          : existing.no_kontrak,
      status:
        body.status !== undefined && isValidStatus(body.status)
          ? body.status
          : existing.status,
    };

    const trackedFields: Array<'memo_number' | 'supplier' | 'periode_start' | 'periode_end' | 'no_kontrak'> = [
      'memo_number',
      'supplier',
      'periode_start',
      'periode_end',
      'no_kontrak',
    ];

    const updateTx = db.transaction(() => {
      stmtUpdateMemoHeader.run(
        nextValues.memo_number,
        nextValues.supplier,
        nextValues.periode_start,
        nextValues.periode_end,
        nextValues.no_kontrak,
        nextValues.status,
        now,
        memoId
      );

      for (const field of trackedFields) {
        if (existing[field] !== nextValues[field]) {
          insertAudit({
            memoId,
            memoNumber: nextValues.memo_number,
            action: 'UPDATE_HEADER',
            fieldName: field,
            oldValue: existing[field],
            newValue: nextValues[field],
            actor,
            note,
            createdAt: now,
          });
        }
      }
    });

    updateTx();
    res.json({ memo: fetchMemoById(memoId) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update memo' });
  }
});

app.delete('/api/memos/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const memoId = Number(req.params.id);
    if (!Number.isInteger(memoId) || memoId <= 0) {
      res.status(400).json({ error: 'Invalid memo id' });
      return;
    }

    const existing = fetchMemoById(memoId);
    if (!existing) {
      res.status(404).json({ error: 'Memo not found' });
      return;
    }
    if (!canAccessMemo(existing, req.user!.role)) {
      res.status(403).json({ error: 'Memo belum diverifikasi oleh Admin.' });
      return;
    }

    const actor = getActorName(req);
    const note = cleanText(req.body?.note, 300);
    const now = new Date().toISOString();

    const delTx = db.transaction(() => {
      insertAudit({
        memoId: null,
        memoNumber: existing.memo_number,
        action: 'DELETE_MEMO',
        fieldName: 'memo',
        oldValue: `${existing.memo_number} (${existing.items.length} items)`,
        newValue: 'Deleted',
        actor,
        note,
        createdAt: now,
      });
      stmtDeleteMemo.run(memoId);
    });

    delTx();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete memo' });
  }
});

app.post('/api/memos/:id/items', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const memoId = Number(req.params.id);
    if (!Number.isInteger(memoId) || memoId <= 0) {
      res.status(400).json({ error: 'Invalid memo id' });
      return;
    }

    const memo = fetchMemoById(memoId);
    if (!memo) {
      res.status(404).json({ error: 'Memo not found' });
      return;
    }
    if (!canAccessMemo(memo, req.user!.role)) {
      res.status(403).json({ error: 'Memo belum diverifikasi oleh Admin.' });
      return;
    }

    const body = req.body as {
      kode?: string;
      nama?: string;
      qty?: number;
      discount_type?: DiscountType;
      diskon_satuan?: number;
      harga_satuan?: number;
      rafraksi_pct?: number;
      note?: string;
    };

    const discountType: DiscountType =
      memo.mode === 'mixed'
        ? isValidDiscountType(body.discount_type)
          ? body.discount_type
          : 'potongan'
        : memo.mode;

    const kode = cleanKode6(body.kode);
    const nama = cleanText(body.nama, 240);
    const qty = cleanNumber(body.qty, 0);
    const diskon_satuan = discountType === 'potongan' ? cleanNumber(body.diskon_satuan, 0) : 0;
    const harga_satuan = cleanNumber(body.harga_satuan, 0);
    const rafraksi_pct = discountType === 'rafraksi' ? cleanNumber(body.rafraksi_pct, 0) : 0;
    const actor = getActorName(req);
    const note = cleanText(body.note, 300);
    const now = new Date().toISOString();

    const maxOrderRow = db
      .prepare('SELECT COALESCE(MAX(row_order), -1) as max_order FROM memo_items WHERE memo_id = ?')
      .get(memoId) as { max_order: number };
    const nextOrder = maxOrderRow.max_order + 1;

    const addTx = db.transaction(() => {
      const info = stmtInsertItem.run(
        memoId,
        nextOrder,
        kode,
        nama,
        qty,
        discountType,
        diskon_satuan,
        harga_satuan,
        rafraksi_pct,
        now,
        now
      );
      const itemId = Number(info.lastInsertRowid);
      stmtTouchMemo.run(now, memoId);

      insertAudit({
        memoId,
        memoNumber: memo.memo_number,
        itemId,
        itemKode: kode || `#${itemId}`,
        action: 'ADD_ITEM',
        fieldName: 'line_item',
        oldValue: '',
        newValue: `${kode || 'NEW'} · ${nama || 'Untitled'} (${discountType})`,
        actor,
        note,
        createdAt: now,
      });
      return itemId;
    });

    const itemId = addTx();
    const item = stmtGetItemById.get(itemId) as MemoItem;
    res.status(201).json({ item, memo: fetchMemoById(memoId) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to add item' });
  }
});

app.patch('/api/items/:itemId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const itemId = Number(req.params.itemId);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      res.status(400).json({ error: 'Invalid item id' });
      return;
    }

    const existing = stmtGetItemById.get(itemId) as MemoItem | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const memo = stmtGetMemoRow.get(existing.memo_id) as RawMemoRow | undefined;
    if (!memo) {
      res.status(404).json({ error: 'Parent memo not found' });
      return;
    }
    if (!canAccessMemo(memo, req.user!.role)) {
      res.status(403).json({ error: 'Memo belum diverifikasi oleh Admin.' });
      return;
    }

    const body = req.body as {
      kode?: string;
      nama?: string;
      qty?: number;
      discount_type?: DiscountType;
      diskon_satuan?: number;
      harga_satuan?: number;
      rafraksi_pct?: number;
      note?: string;
    };

    const actor = getActorName(req);
    const note = cleanText(body.note, 300);
    const now = new Date().toISOString();

    let nextDiskonSatuan =
      body.diskon_satuan !== undefined
        ? cleanNumber(body.diskon_satuan, existing.diskon_satuan)
        : existing.diskon_satuan;
    const nextHargaSatuan =
      body.harga_satuan !== undefined
        ? cleanNumber(body.harga_satuan, existing.harga_satuan)
        : existing.harga_satuan;
    let nextRafraksiPct =
      body.rafraksi_pct !== undefined
        ? cleanNumber(body.rafraksi_pct, existing.rafraksi_pct)
        : existing.rafraksi_pct;

    let nextDiscountType: DiscountType =
      memo.mode === 'mixed' && body.discount_type !== undefined && isValidDiscountType(body.discount_type)
        ? body.discount_type
        : memo.mode === 'mixed'
        ? existing.discount_type
        : memo.mode;

    // In mixed mode, editing Diskon Satuan automatically clears Rafraksi %, and vice versa
    if (memo.mode === 'mixed') {
      if (body.diskon_satuan !== undefined && nextDiskonSatuan > 0) {
        nextDiscountType = 'potongan';
        nextRafraksiPct = 0;
      } else if (body.rafraksi_pct !== undefined && nextRafraksiPct > 0) {
        nextDiscountType = 'rafraksi';
        nextDiskonSatuan = 0;
      } else if (nextDiscountType === 'potongan') {
        nextRafraksiPct = 0;
      } else {
        nextDiskonSatuan = 0;
      }
    } else if (nextDiscountType === 'potongan') {
      nextRafraksiPct = 0;
    } else {
      nextDiskonSatuan = 0;
    }

    const next = {
      kode: body.kode !== undefined ? cleanKode6(body.kode) : existing.kode,
      nama: body.nama !== undefined ? cleanText(body.nama, 240) : existing.nama,
      qty: body.qty !== undefined ? cleanNumber(body.qty, existing.qty) : existing.qty,
      discount_type: nextDiscountType,
      diskon_satuan: nextDiskonSatuan,
      harga_satuan: nextHargaSatuan,
      rafraksi_pct: nextRafraksiPct,
    };

    const fields: Array<keyof typeof next> = [
      'kode',
      'nama',
      'qty',
      'discount_type',
      'diskon_satuan',
      'harga_satuan',
      'rafraksi_pct',
    ];

    const updateTx = db.transaction(() => {
      db.prepare(
        `UPDATE memo_items SET
          kode = ?, nama = ?, qty = ?, discount_type = ?,
          diskon_satuan = ?, harga_satuan = ?, rafraksi_pct = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        next.kode,
        next.nama,
        next.qty,
        next.discount_type,
        next.diskon_satuan,
        next.harga_satuan,
        next.rafraksi_pct,
        now,
        itemId
      );

      stmtTouchMemo.run(now, memo.id);

      for (const field of fields) {
        if (String(existing[field]) !== String(next[field])) {
          insertAudit({
            memoId: memo.id,
            memoNumber: memo.memo_number,
            itemId,
            itemKode: next.kode || existing.kode || `#${itemId}`,
            action: 'UPDATE_ITEM',
            fieldName: field,
            oldValue: String(existing[field]),
            newValue: String(next[field]),
            actor,
            note,
            createdAt: now,
          });
        }
      }
    });

    updateTx();
    const updated = stmtGetItemById.get(itemId) as MemoItem;
    res.json({ item: updated, memo: fetchMemoById(memo.id) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update item' });
  }
});

app.delete('/api/items/:itemId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const itemId = Number(req.params.itemId);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      res.status(400).json({ error: 'Invalid item id' });
      return;
    }

    const existing = stmtGetItemById.get(itemId) as MemoItem | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const memo = stmtGetMemoRow.get(existing.memo_id) as RawMemoRow | undefined;
    if (memo && !canAccessMemo(memo, req.user!.role)) {
      res.status(403).json({ error: 'Memo belum diverifikasi oleh Admin.' });
      return;
    }

    const actor = getActorName(req);
    const note = cleanText(req.body?.note, 300);
    const now = new Date().toISOString();

    const delTx = db.transaction(() => {
      db.prepare('DELETE FROM memo_items WHERE id = ?').run(itemId);
      if (memo) {
        db.prepare('UPDATE memos SET updated_at = ? WHERE id = ?').run(now, memo.id);
        insertAudit({
          memoId: memo.id,
          memoNumber: memo.memo_number,
          itemId: null,
          itemKode: existing.kode || `#${itemId}`,
          action: 'DELETE_ITEM',
          fieldName: 'line_item',
          oldValue: `${existing.kode} · ${existing.nama} (QTY ${existing.qty})`,
          newValue: 'Removed',
          actor,
          note,
          createdAt: now,
        });
      }
    });

    delTx();
    res.json({ ok: true, memo: memo ? fetchMemoById(memo.id) : null });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete item' });
  }
});

// Add internal comment to a memo (not printed)
app.post('/api/memos/:id/comments', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const memoId = Number(req.params.id);
    if (!Number.isInteger(memoId) || memoId <= 0) {
      res.status(400).json({ error: 'Invalid memo id' });
      return;
    }

    const memo = fetchMemoById(memoId);
    if (!memo) {
      res.status(404).json({ error: 'Memo not found' });
      return;
    }
    if (!canAccessMemo(memo, req.user!.role)) {
      res.status(403).json({ error: 'Memo belum diverifikasi oleh Admin.' });
      return;
    }

    const body = req.body as { comment?: string };
    const commentText = cleanText(body.comment, 500);
    if (!commentText) {
      res.status(400).json({ error: 'Comment text is required' });
      return;
    }

    const author = getActorName(req);
    const now = new Date().toISOString();

    const addCommentTx = db.transaction(() => {
      const info = stmtInsertComment.run(memoId, author, commentText, now);
      const commentId = Number(info.lastInsertRowid);
      insertAudit({
        memoId,
        memoNumber: memo.memo_number,
        action: 'ADD_COMMENT',
        fieldName: 'internal_comment',
        newValue: commentText,
        actor: author,
        createdAt: now,
      });
      return commentId;
    });

    const commentId = addCommentTx();
    const comment = db
      .prepare('SELECT * FROM memo_comments WHERE id = ?')
      .get(commentId) as MemoComment;
    res.status(201).json({ comment, memo: fetchMemoById(memoId) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to add comment' });
  }
});

// Delete internal comment
app.delete('/api/comments/:commentId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const commentId = Number(req.params.commentId);
    if (!Number.isInteger(commentId) || commentId <= 0) {
      res.status(400).json({ error: 'Invalid comment id' });
      return;
    }

    const existing = stmtGetCommentById.get(commentId) as MemoComment | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Comment not found' });
      return;
    }

    const memo = stmtGetMemoRow.get(existing.memo_id) as RawMemoRow | undefined;
    if (memo && !canAccessMemo(memo, req.user!.role)) {
      res.status(403).json({ error: 'Memo belum diverifikasi oleh Admin.' });
      return;
    }
    const actor = getActorName(req);
    const now = new Date().toISOString();

    const delTx = db.transaction(() => {
      db.prepare('DELETE FROM memo_comments WHERE id = ?').run(commentId);
      if (memo) {
        insertAudit({
          memoId: memo.id,
          memoNumber: memo.memo_number,
          action: 'DELETE_COMMENT',
          fieldName: 'internal_comment',
          oldValue: existing.comment,
          newValue: 'Removed',
          actor,
          createdAt: now,
        });
      }
    });

    delTx();
    res.json({ ok: true, memo: memo ? fetchMemoById(memo.id) : null });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete comment' });
  }
});

// Merge multiple memos (same mode stays potongan/rafraksi; mixed modes produce a mixed memo)
app.post('/api/memos/merge', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body as {
      sourceMemoIds?: number[];
      memo_number?: string;
      supplier?: string;
      periode_start?: string;
      periode_end?: string;
      no_kontrak?: string;
      combineSameKode?: boolean;
      deleteSources?: boolean;
      note?: string;
    };

    const ids = Array.isArray(body.sourceMemoIds)
      ? body.sourceMemoIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : [];

    if (ids.length < 2) {
      res.status(400).json({ error: 'Select at least 2 memos to merge' });
      return;
    }

    const sources = fetchMemosByIds(ids);

    if (sources.length < 2) {
      res.status(404).json({ error: 'Could not find selected source memos' });
      return;
    }

    if (sources.some((s) => !canAccessMemo(s, req.user!.role))) {
      res.status(403).json({ error: 'Terdapat memo yang belum diverifikasi oleh Admin.' });
      return;
    }

    const firstMode = sources[0].mode;
    const mergedMode: ClaimMode = sources.every((s) => s.mode === firstMode)
      ? firstMode
      : 'mixed';

    const actor = getActorName(req);
    const note = cleanText(body.note, 300);
    const now = new Date().toISOString();
    const mergedStatus: MemoStatus =
      req.user!.role === 'audit' || sources.every((s) => s.status !== 'draft')
        ? 'verified'
        : 'draft';

    const mergedMemoNumber =
      cleanText(body.memo_number, 64) || sources.map((s) => s.memo_number).join('+').slice(0, 64);
    const mergedSupplier =
      body.supplier !== undefined ? cleanText(body.supplier, 160) : sources[0].supplier;
    const mergedPeriodeStart =
      body.periode_start !== undefined
        ? cleanText(body.periode_start, 64)
        : sources[0].periode_start;
    const mergedPeriodeEnd =
      body.periode_end !== undefined
        ? cleanText(body.periode_end, 64)
        : sources[sources.length - 1].periode_end;
    const mergedNoKontrak =
      body.no_kontrak !== undefined ? cleanText(body.no_kontrak, 120) : sources[0].no_kontrak;

    const rawItems = sources.flatMap((s) =>
      s.items.map((item) => ({
        ...item,
        discount_type:
          s.mode === 'mixed'
            ? item.discount_type
            : s.mode === 'rafraksi'
            ? ('rafraksi' as const)
            : ('potongan' as const),
      }))
    );

    let consolidated: Array<{
      kode: string;
      nama: string;
      qty: number;
      discount_type: DiscountType;
      diskon_satuan: number;
      harga_satuan: number;
      rafraksi_pct: number;
    }>;

    if (body.combineSameKode) {
      const grouped = new Map<
        string,
        {
          kode: string;
          nama: string;
          qty: number;
          discount_type: DiscountType;
          diskon_satuan: number;
          harga_satuan: number;
          rafraksi_pct: number;
        }
      >();
      for (const item of rawItems) {
        const rateKey =
          item.discount_type === 'potongan'
            ? `P_${item.diskon_satuan}`
            : `R_${item.harga_satuan}_${item.rafraksi_pct}`;
        const key = `${item.kode.trim()}__${rateKey}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.qty += item.qty;
        } else {
          grouped.set(key, {
            kode: item.kode,
            nama: item.nama,
            qty: item.qty,
            discount_type: item.discount_type,
            diskon_satuan: item.diskon_satuan,
            harga_satuan: item.harga_satuan,
            rafraksi_pct: item.rafraksi_pct,
          });
        }
      }
      consolidated = Array.from(grouped.values());
    } else {
      consolidated = rawItems.map((item) => ({
        kode: item.kode,
        nama: item.nama,
        qty: item.qty,
        discount_type: item.discount_type,
        diskon_satuan: item.diskon_satuan,
        harga_satuan: item.harga_satuan,
        rafraksi_pct: item.rafraksi_pct,
      }));
    }

    const mergeTx = db.transaction(() => {
      const info = stmtInsertMemo.run(
        mergedMemoNumber,
        mergedMode,
        mergedSupplier,
        mergedPeriodeStart,
        mergedPeriodeEnd,
        mergedNoKontrak,
        `Merged: ${sources.map((s) => s.memo_number).join(', ')}`,
        mergedStatus,
        now,
        now
      );
      const newMemoId = Number(info.lastInsertRowid);

      consolidated.forEach((item, idx) => {
        stmtInsertItem.run(
          newMemoId,
          idx,
          item.kode,
          item.nama,
          item.qty,
          item.discount_type,
          item.diskon_satuan,
          item.harga_satuan,
          item.rafraksi_pct,
          now,
          now
        );
      });

      insertAudit({
        memoId: newMemoId,
        memoNumber: mergedMemoNumber,
        action: 'MERGE_MEMOS',
        fieldName: 'merged_sources',
        oldValue: sources.map((s) => s.memo_number).join(' + '),
        newValue: `${consolidated.length} item(s) (${mergedMode})`,
        actor,
        note:
          note ||
          (body.combineSameKode ? 'Combined identical SKUs' : 'Kept all line items sequentially'),
        createdAt: now,
      });

      if (body.deleteSources) {
        for (const src of sources) {
          insertAudit({
            memoId: null,
            memoNumber: src.memo_number,
            action: 'DELETE_MEMO',
            fieldName: 'merged_into',
            oldValue: src.memo_number,
            newValue: mergedMemoNumber,
            actor,
            note: `Merged into ${mergedMemoNumber}`,
            createdAt: now,
          });
          stmtDeleteMemo.run(src.id);
        }
      }

      return newMemoId;
    });

    const newMemoId = mergeTx();
    res.status(201).json({ memo: fetchMemoById(newMemoId) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to merge memos' });
  }
});

// Bulk update supplier, period, contract, or verification status across multiple memos
app.post('/api/memos/bulk-update', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body as {
      memoIds?: number[];
      supplier?: string;
      periode_start?: string;
      periode_end?: string;
      no_kontrak?: string;
      status?: MemoStatus;
      note?: string;
    };

    const ids = Array.isArray(body.memoIds)
      ? body.memoIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : [];

    if (ids.length === 0) {
      res.status(400).json({ error: 'Select at least one memo' });
      return;
    }

    if (req.user!.role === 'audit' && body.status === 'draft') {
      res.status(403).json({ error: 'Audit tidak dapat mengubah memo menjadi belum diverifikasi.' });
      return;
    }

    const actor = getActorName(req);
    const note = cleanText(body.note, 300) || 'Pembaruan massal';
    const now = new Date().toISOString();

    const targetRows = fetchMemoRowsByIds(ids);
    if (targetRows.some((m) => !canAccessMemo(m, req.user!.role))) {
      res.status(403).json({ error: 'Terdapat memo yang belum diverifikasi oleh Admin.' });
      return;
    }

    const trackedFields: Array<'supplier' | 'periode_start' | 'periode_end' | 'no_kontrak'> = [
      'supplier',
      'periode_start',
      'periode_end',
      'no_kontrak',
    ];

    const bulkTx = db.transaction(() => {
      for (const existing of targetRows) {
        const nextValues = {
          supplier:
            body.supplier !== undefined ? cleanText(body.supplier, 160) : existing.supplier,
          periode_start:
            body.periode_start !== undefined
              ? cleanText(body.periode_start, 64)
              : existing.periode_start,
          periode_end:
            body.periode_end !== undefined
              ? cleanText(body.periode_end, 64)
              : existing.periode_end,
          no_kontrak:
            body.no_kontrak !== undefined
              ? cleanText(body.no_kontrak, 120)
              : existing.no_kontrak,
          status:
            body.status !== undefined && isValidStatus(body.status)
              ? body.status
              : existing.status,
        };

        stmtUpdateMemoBulk.run(
          nextValues.supplier,
          nextValues.periode_start,
          nextValues.periode_end,
          nextValues.no_kontrak,
          nextValues.status,
          now,
          existing.id
        );

        for (const field of trackedFields) {
          if (existing[field] !== nextValues[field]) {
            insertAudit({
              memoId: existing.id,
              memoNumber: existing.memo_number,
              action: 'UPDATE_HEADER',
              fieldName: field,
              oldValue: existing[field],
              newValue: nextValues[field],
              actor,
              note,
              createdAt: now,
            });
          }
        }
      }
    });

    bulkTx();
    res.json({ memos: fetchAllMemos(req.user!.role) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Bulk update failed' });
  }
});

// Record print timestamp, user, and print count for selected memos
app.post('/api/memos/mark-printed', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body as { memoIds?: number[] };
    const ids = Array.isArray(body.memoIds)
      ? Array.from(new Set(body.memoIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)))
      : [];

    if (ids.length === 0) {
      res.status(400).json({ error: 'Pilih minimal satu memo untuk dicetak.' });
      return;
    }

    const targets = fetchMemoRowsByIds(ids);

    if (targets.some((m) => !canAccessMemo(m, req.user!.role))) {
      res.status(403).json({ error: 'Terdapat memo yang belum diverifikasi oleh Admin.' });
      return;
    }

    const actor = getActorName(req);
    const now = new Date().toISOString();

    const printTx = db.transaction(() => {
      for (const memo of targets) {
        const nextCount = Number(memo.print_count ?? 0) + 1;
        stmtMarkMemoPrinted.run(now, actor, nextCount, memo.id);

        insertAudit({
          memoId: memo.id,
          memoNumber: memo.memo_number,
          action: 'PRINT_MEMO',
          fieldName: 'print',
          oldValue: memo.print_count > 0 ? `Cetakan ke-${memo.print_count}` : 'Belum dicetak',
          newValue: `Dicetak (ke-${nextCount})`,
          actor,
          createdAt: now,
        });
      }
    });

    printTx();
    res.json({ memos: fetchAllMemos(req.user!.role) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal mencatat cetakan' });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`PromoClaim Ledger running on http://0.0.0.0:${port} (SQLite: ${DB_PATH})`);
  });
}

startServer();
