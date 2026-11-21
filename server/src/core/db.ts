/**
 * Database access. All SQL in this server uses `?` placeholders and a portable
 * subset of SQL so it runs on TiDB/MySQL in production and on SQLite in tests.
 */
export type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Param = string | number | boolean | null | undefined;

export interface Db {
  /** Run a SELECT and return rows. */
  all(sql: string, params?: Param[]): Promise<Row[]>;
  /** Run INSERT/UPDATE/DELETE; returns affected row count. */
  run(sql: string, params?: Param[]): Promise<number>;
  /** Run `fn` inside a transaction (commit on success, rollback on error). */
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function one(db: Db, sql: string, params?: Param[]): Promise<Row | null> {
  return (await db.all(sql, params))[0] ?? null;
}

/** Builds "?, ?, ?" for an IN (...) list. Returns "NULL" for an empty list so the query stays valid. */
export const inList = (values: unknown[]) => (values.length ? values.map(() => "?").join(", ") : "NULL");

export function isDuplicateKey(e: unknown) {
  const err = e as { code?: string; errno?: number; message?: string };
  return err?.code === "ER_DUP_ENTRY" || err?.errno === 1062 || /UNIQUE constraint failed|Duplicate entry/i.test(err?.message ?? "");
}

/** Production adapter: mysql2 connection pool (TiDB Cloud needs TLS). */
export async function createMysqlDb(url: string, ssl: boolean): Promise<Db> {
  const mysql = await import("mysql2/promise");
  const pool = mysql.createPool({
    uri: url,
    ssl: ssl ? { minVersion: "TLSv1.2", rejectUnauthorized: true } : undefined,
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true,       // DATETIME/DATE come back as strings (UTC)
    decimalNumbers: true,    // DECIMAL comes back as number
    timezone: "Z",
    supportBigNumbers: true,
  });
  // mysql2/promise's typings declare a promise connection here, but the event actually
  // emits the callback connection — wrap it before using promise APIs.
  pool.on("connection", (c) => {
    const conn = c as unknown as { promise: () => { query: (sql: string) => Promise<unknown> } };
    void conn.promise().query("SET time_zone = '+00:00'").catch((e: unknown) => console.error("[db] time zone setup failed:", e));
  });

  const make = (conn: { query: (sql: string, params?: unknown[]) => Promise<unknown> }): Omit<Db, "tx" | "close"> => ({
    async all(sql, params = []) {
      const [rows] = (await conn.query(sql, params.map((p) => (p === undefined ? null : p)))) as [Row[]];
      return rows;
    },
    async run(sql, params = []) {
      const [res] = (await conn.query(sql, params.map((p) => (p === undefined ? null : p)))) as [{ affectedRows: number }];
      return res.affectedRows;
    },
  });

  const db: Db = {
    ...make(pool),
    async tx(fn) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const inner: Db = { ...make(conn), tx: (f) => f(inner), close: async () => {} };
        const out = await fn(inner);
        await conn.commit();
        return out;
      } catch (e) {
        await conn.rollback().catch(() => {});
        throw e;
      } finally {
        conn.release();
      }
    },
    close: () => pool.end(),
  };
  return db;
}
