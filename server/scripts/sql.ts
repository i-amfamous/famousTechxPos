/** Splits schema.sql into statements (drops comments). */
export function splitSql(sql: string): string[] {
  return sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}
