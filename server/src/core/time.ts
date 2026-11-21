/** Time helpers. All timestamps are stored as UTC `DATETIME(3)` strings: "YYYY-MM-DD HH:MM:SS.mmm". */


/** UTC timestamp in the format stored in DATETIME(3) columns. */
export const nowSql = (d = new Date()) => d.toISOString().slice(0, 23).replace("T", " ");

export const sqlFromIso = (iso: string) => nowSql(new Date(iso));

export const addMinutes = (m: number, d = new Date()) => nowSql(new Date(d.getTime() + m * 60_000));

/** DATETIME string → ISO 8601 for the API. */
export const iso = (v: string | null | undefined) => (v ? (v.includes("T") ? v : v.replace(" ", "T") + (v.length > 10 ? "Z" : "")) : null);

export const today = () => new Date().toISOString().slice(0, 10);
