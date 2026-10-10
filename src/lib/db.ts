import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import Database from "better-sqlite3";

// The app was written against Cloudflare D1 and R2. It now runs as a plain Node
// server (Hong Kong VM), so these two small adapters expose the subset of the
// D1/R2 APIs the routes use, backed by a local SQLite file and a local folder.

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "data", "miemie.db");
const PHOTOS_DIR = process.env.PHOTOS_DIR ?? path.join(process.cwd(), "data", "photos");

// ── D1 → better-sqlite3 ───────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function toSqlite(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof ArrayBuffer) return Buffer.from(v);
  return v;
}

class Statement {
  constructor(private db: Database.Database, private sql: string, private params: unknown[] = []) {}

  bind(...params: unknown[]) {
    return new Statement(this.db, this.sql, params.map(toSqlite));
  }

  private stmt() {
    return this.db.prepare(this.sql);
  }

  // Synchronous core, shared by the async API and batch().
  execute() {
    const stmt = this.stmt();
    if (stmt.reader) {
      return { results: stmt.all(...this.params) as Row[], success: true, meta: { changes: 0, last_row_id: 0 } };
    }
    const info = stmt.run(...this.params);
    return {
      results: [] as Row[],
      success: true,
      meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) },
    };
  }

  async first<T = Row>(column?: string): Promise<T | null> {
    const row = this.stmt().get(...this.params) as Row | undefined;
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }

  async all<T = Row>() {
    return this.execute() as unknown as { results: T[]; success: true; meta: { changes: number; last_row_id: number } };
  }

  async run() {
    return this.execute();
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    return this.stmt().raw().all(...this.params) as T[];
  }
}

class LocalD1 {
  constructor(private db: Database.Database) {}

  prepare(sql: string) {
    return new Statement(this.db, sql);
  }

  async batch(statements: Statement[]) {
    return this.db.transaction(() => statements.map((s) => s.execute()))();
  }

  async exec(sql: string) {
    this.db.exec(sql);
    return { count: 0, duration: 0 };
  }
}

// ── R2 → local folder ─────────────────────────────────────────────────────────
// Each object is a file; its content type lives in a "<file>.meta.json" sidecar.
// Files copied over from R2 without a sidecar get their type sniffed instead.

type HttpMetadata = { contentType?: string; cacheControl?: string };

function sniffContentType(head: Buffer): string {
  if (head[0] === 0xff && head[1] === 0xd8) return "image/jpeg";
  if (head.subarray(0, 4).toString("hex") === "89504e47") return "image/png";
  if (head.subarray(0, 3).toString() === "GIF") return "image/gif";
  if (head.subarray(0, 4).toString() === "RIFF" && head.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (head.subarray(4, 8).toString() === "ftyp") {
    const brand = head.subarray(8, 12).toString();
    return brand.startsWith("hei") || brand.startsWith("mif") ? "image/heic" : "video/mp4";
  }
  if (head[0] === 0x7b || head[0] === 0x5b) return "application/json";
  return "application/octet-stream";
}

class LocalBucket {
  constructor(private root: string) {}

  private file(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(path.resolve(this.root) + path.sep)) throw new Error(`Invalid key: ${key}`);
    return p;
  }

  private meta(p: string, size: number): HttpMetadata {
    try {
      return JSON.parse(fs.readFileSync(`${p}.meta.json`, "utf8"));
    } catch {
      const head = Buffer.alloc(Math.min(12, size));
      const fd = fs.openSync(p, "r");
      fs.readSync(fd, head, 0, head.length, 0);
      fs.closeSync(fd);
      return { contentType: sniffContentType(head) };
    }
  }

  async head(key: string) {
    let p: string;
    try {
      p = this.file(key);
    } catch {
      return null;
    }
    if (!fs.existsSync(p)) return null;
    const { size } = fs.statSync(p);
    return { key, size, httpMetadata: this.meta(p, size) };
  }

  async get(key: string, opts?: { range?: { offset: number; length: number } }) {
    const obj = await this.head(key);
    if (!obj) return null;
    const range = opts?.range;
    const stream = fs.createReadStream(
      this.file(key),
      range ? { start: range.offset, end: range.offset + range.length - 1 } : undefined
    );
    return { ...obj, body: Readable.toWeb(stream) as ReadableStream };
  }

  async put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | string,
    opts?: { httpMetadata?: HttpMetadata }
  ) {
    const p = this.file(key);
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    if (value instanceof ReadableStream) {
      await fs.promises.writeFile(p, Readable.fromWeb(value as import("node:stream/web").ReadableStream));
    } else if (typeof value === "string") {
      await fs.promises.writeFile(p, value);
    } else if (value instanceof ArrayBuffer) {
      await fs.promises.writeFile(p, Buffer.from(value));
    } else {
      await fs.promises.writeFile(p, Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    }
    if (opts?.httpMetadata) {
      await fs.promises.writeFile(`${p}.meta.json`, JSON.stringify(opts.httpMetadata));
    }
  }

  async delete(key: string) {
    const p = this.file(key);
    await fs.promises.rm(p, { force: true });
    await fs.promises.rm(`${p}.meta.json`, { force: true });
  }
}

// ── Singletons (survive dev hot reloads) ──────────────────────────────────────

const g = globalThis as unknown as { __db?: LocalD1; __bucket?: LocalBucket };

export async function getDB(): Promise<D1Database> {
  if (!g.__db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const sqlite = new Database(DB_PATH);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("busy_timeout = 5000");
    sqlite.pragma("foreign_keys = ON"); // D1 enforces foreign keys by default
    g.__db = new LocalD1(sqlite);
  }
  return g.__db as unknown as D1Database;
}

export async function getPhotoBucket(): Promise<R2Bucket> {
  if (!g.__bucket) {
    fs.mkdirSync(PHOTOS_DIR, { recursive: true });
    g.__bucket = new LocalBucket(PHOTOS_DIR);
  }
  return g.__bucket as unknown as R2Bucket;
}
