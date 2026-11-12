import json
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path


class MarketStore:
    def __init__(self, data_dir: Path):
        data_dir.mkdir(parents=True, exist_ok=True)
        self.path = data_dir / "market.db"
        with self.connect() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("PRAGMA synchronous=NORMAL")
            connection.executescript("""
                CREATE TABLE IF NOT EXISTS instruments (
                    id TEXT PRIMARY KEY,
                    code TEXT NOT NULL,
                    name TEXT NOT NULL,
                    market TEXT NOT NULL,
                    search_text TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_instruments_market ON instruments(market);
                CREATE INDEX IF NOT EXISTS idx_instruments_code ON instruments(code);
                CREATE TABLE IF NOT EXISTS quotes (
                    instrument_id TEXT PRIMARY KEY,
                    price REAL NOT NULL,
                    change_pct REAL NOT NULL,
                    amount REAL,
                    turnover REAL,
                    cap REAL,
                    source TEXT NOT NULL,
                    quote_time TEXT,
                    data_status TEXT NOT NULL,
                    fetched_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS candles (
                    instrument_id TEXT NOT NULL,
                    period TEXT NOT NULL,
                    adjustment TEXT NOT NULL,
                    time INTEGER NOT NULL,
                    open REAL NOT NULL,
                    high REAL NOT NULL,
                    low REAL NOT NULL,
                    close REAL NOT NULL,
                    volume REAL NOT NULL,
                    amount REAL,
                    source TEXT NOT NULL,
                    fetched_at TEXT NOT NULL,
                    PRIMARY KEY (instrument_id, period, adjustment, time)
                );
                CREATE TABLE IF NOT EXISTS ingestion_state (
                    instrument_id TEXT NOT NULL,
                    period TEXT NOT NULL,
                    adjustment TEXT NOT NULL,
                    status TEXT NOT NULL,
                    last_time INTEGER,
                    row_count INTEGER NOT NULL DEFAULT 0,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    source TEXT,
                    error TEXT,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (instrument_id, period, adjustment)
                );
                CREATE TABLE IF NOT EXISTS collection_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    status TEXT NOT NULL,
                    markets TEXT NOT NULL,
                    period TEXT NOT NULL,
                    total INTEGER NOT NULL DEFAULT 0,
                    completed INTEGER NOT NULL DEFAULT 0,
                    failed INTEGER NOT NULL DEFAULT 0,
                    rows_collected INTEGER NOT NULL DEFAULT 0,
                    current_id TEXT,
                    error TEXT,
                    started_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    finished_at TEXT
                );
                CREATE TABLE IF NOT EXISTS metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS fundamentals (
                    instrument_id TEXT PRIMARY KEY,
                    payload TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sector_members (
                    sector_name TEXT NOT NULL,
                    instrument_id TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (sector_name, instrument_id)
                );
            """)

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout=10000")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    @staticmethod
    def now():
        return datetime.now(timezone.utc).isoformat()

    def save_instruments(self, items):
        if not items:
            return
        timestamp = self.now()
        rows = [(
            item["id"], item["code"], item["name"], item["market"],
            f"{item['id']} {item['code']} {item['name']} {' '.join(item.get('aliases', []))} {item.get('pinyin', '')} {item.get('initials', '')}".lower(),
            json.dumps(item, ensure_ascii=False, separators=(",", ":")), timestamp,
        ) for item in items]
        with self.connect() as connection:
            connection.executemany("""
                INSERT INTO instruments(id, code, name, market, search_text, payload, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET code=excluded.code, name=excluded.name,
                    market=excluded.market, search_text=excluded.search_text,
                    payload=excluded.payload, updated_at=excluded.updated_at
            """, rows)

    def save_quotes(self, quotes):
        rows = [(
            item["id"], item["price"], item["changePct"], item.get("amount", 0),
            item.get("turnover", 0), item.get("cap", 0), item["dataSource"],
            item.get("quoteTime"), item.get("dataStatus", "snapshot"), int(time.time()),
        ) for item in quotes if item.get("price") is not None]
        if not rows:
            return
        with self.connect() as connection:
            connection.executemany("""
                INSERT INTO quotes(instrument_id, price, change_pct, amount, turnover, cap,
                    source, quote_time, data_status, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(instrument_id) DO UPDATE SET price=excluded.price,
                    change_pct=excluded.change_pct, amount=excluded.amount,
                    turnover=excluded.turnover, cap=excluded.cap, source=excluded.source,
                    quote_time=excluded.quote_time, data_status=excluded.data_status,
                    fetched_at=excluded.fetched_at
            """, rows)

    @staticmethod
    def deserialize(row):
        item = json.loads(row["payload"])
        item["industry"] = item.get("industry") or "未分类"
        item["tags"] = item.get("tags") or []
        if not item.get("financialSource"):
            for key in ["dividend", "roe", "net", "debt"]:
                item[key] = None
        if row["price"] is not None:
            item.update({
                "price": row["price"], "changePct": row["change_pct"],
                "amount": row["amount"], "turnover": row["turnover"], "cap": row["cap"],
                "dataSource": row["source"], "quoteTime": row["quote_time"],
                "dataStatus": "cached" if time.time() - row["fetched_at"] > 90 else row["data_status"],
            })
        return item

    select_instruments = """
        SELECT i.*, q.price, q.change_pct, q.amount, q.turnover, q.cap,
            q.source, q.quote_time, q.data_status, q.fetched_at
        FROM instruments i LEFT JOIN quotes q ON q.instrument_id = i.id
    """

    def instruments(self, ids=None):
        if ids is not None and not ids:
            return []
        with self.connect() as connection:
            if ids is None:
                rows = connection.execute(self.select_instruments + " ORDER BY i.market, i.code").fetchall()
            else:
                rows = []
                for start in range(0, len(ids), 500):
                    batch = ids[start:start + 500]
                    placeholders = ",".join("?" for _ in batch)
                    rows.extend(connection.execute(
                        self.select_instruments + f" WHERE i.id IN ({placeholders})", batch,
                    ).fetchall())
        by_id = {row["id"]: self.deserialize(row) for row in rows}
        return [by_id[item] for item in ids if item in by_id] if ids is not None else list(by_id.values())

    def search(self, query, limit=30, market=None):
        normalized = query.strip().lower().replace(" ", "")
        conditions, params = [], []
        if normalized:
            conditions.append("i.search_text LIKE ?")
            params.append(f"%{normalized}%")
        if market == "CN":
            conditions.append("i.market IN ('SH', 'SZ', 'BJ')")
        elif market in {"HK", "US"}:
            conditions.append("i.market = ?")
            params.append(market)
        where = " WHERE " + " AND ".join(conditions) if conditions else ""
        with self.connect() as connection:
            rows = connection.execute(
                self.select_instruments + where + " ORDER BY i.market, i.code LIMIT ?",
                [*params, min(limit * 30, 1000)],
            ).fetchall()
        def relevance(row):
            code, name = row["code"].lower(), row["name"].lower().replace(" ", "")
            if row["id"].lower() == normalized or code == normalized or name == normalized:
                return 0
            if code.startswith(normalized) or name.startswith(normalized):
                return 1
            payload = json.loads(row["payload"])
            if payload.get("initials", "").startswith(normalized) or payload.get("pinyin", "").startswith(normalized):
                return 2
            return 3
        rows.sort(key=relevance)
        return [self.deserialize(row) for row in rows[:limit]]

    def save_candles(self, instrument_id, period, candles, source, adjustment="none"):
        if not candles:
            return 0
        timestamp = self.now()
        with self.connect() as connection:
            before = connection.total_changes
            connection.executemany("""
                INSERT INTO candles(instrument_id, period, adjustment, time, open, high, low,
                    close, volume, amount, source, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(instrument_id, period, adjustment, time) DO UPDATE SET
                    open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close,
                    volume=excluded.volume, amount=excluded.amount, source=excluded.source,
                    fetched_at=excluded.fetched_at
            """, [(
                instrument_id, period, adjustment, item["time"], item["open"], item["high"],
                item["low"], item["close"], item["volume"], item.get("amount"), source, timestamp,
            ) for item in candles])
            return connection.total_changes - before

    def candles(self, instrument_id, period, limit=500, adjustment="none", before=None):
        condition = "instrument_id=? AND period=? AND adjustment=?"
        params = [instrument_id, period, adjustment]
        if before is not None:
            condition += " AND time < ?"
            params.append(before)
        params.append(limit)
        with self.connect() as connection:
            rows = connection.execute(f"""
                SELECT time, open, high, low, close, volume, amount, source, fetched_at AS fetchedAt FROM (
                    SELECT * FROM candles WHERE {condition}
                    ORDER BY time DESC LIMIT ?
                ) ORDER BY time
            """, params).fetchall()
        return [dict(row) for row in rows]

    def ingestion(self, instrument_id, period, adjustment="none"):
        with self.connect() as connection:
            row = connection.execute("""
                SELECT * FROM ingestion_state WHERE instrument_id=? AND period=? AND adjustment=?
            """, (instrument_id, period, adjustment)).fetchone()
        return dict(row) if row else None

    def record_ingestion(self, instrument_id, period, status, source=None, error=None, adjustment="none"):
        with self.connect() as connection:
            connection.execute("""
                INSERT INTO ingestion_state(instrument_id, period, adjustment, status,
                    last_time, row_count, attempts, source, error, updated_at)
                VALUES (?, ?, ?, ?, (SELECT MAX(time) FROM candles WHERE instrument_id=? AND period=? AND adjustment=?),
                    (SELECT COUNT(*) FROM candles WHERE instrument_id=? AND period=? AND adjustment=?),
                    1, ?, ?, ?)
                ON CONFLICT(instrument_id, period, adjustment) DO UPDATE SET
                    status=excluded.status,
                    last_time=(SELECT MAX(time) FROM candles WHERE instrument_id=? AND period=? AND adjustment=?),
                    row_count=(SELECT COUNT(*) FROM candles WHERE instrument_id=? AND period=? AND adjustment=?),
                    attempts=ingestion_state.attempts+1, source=excluded.source,
                    error=excluded.error, updated_at=excluded.updated_at
            """, (
                instrument_id, period, adjustment, status, instrument_id, period, adjustment,
                instrument_id, period, adjustment, source, error, self.now(),
                instrument_id, period, adjustment, instrument_id, period, adjustment,
            ))

    def create_run(self, markets, period):
        timestamp = self.now()
        with self.connect() as connection:
            cursor = connection.execute("""
                INSERT INTO collection_runs(status, markets, period, started_at, updated_at)
                VALUES ('running', ?, ?, ?, ?)
            """, (json.dumps(markets), period, timestamp, timestamp))
            return cursor.lastrowid

    def update_run(self, run_id, **fields):
        columns = {"status", "total", "completed", "failed", "rows_collected", "current_id", "error", "finished_at"}
        assignments = ", ".join(f"{key}=?" for key in fields if key in columns)
        values = [value for key, value in fields.items() if key in columns]
        with self.connect() as connection:
            connection.execute(
                f"UPDATE collection_runs SET {assignments}, updated_at=? WHERE id=?",
                [*values, self.now(), run_id],
            )

    def latest_run(self):
        with self.connect() as connection:
            row = connection.execute("SELECT * FROM collection_runs ORDER BY id DESC LIMIT 1").fetchone()
        return dict(row) if row else None

    def metadata(self, key):
        with self.connect() as connection:
            row = connection.execute("SELECT value FROM metadata WHERE key=?", (key,)).fetchone()
        return row["value"] if row else None

    def set_metadata(self, key, value):
        with self.connect() as connection:
            connection.execute("INSERT INTO metadata(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, value))

    def snapshot(self, key):
        value = self.metadata(f"snapshot:{key}")
        return json.loads(value) if value else None

    def save_snapshot(self, key, value):
        self.set_metadata(f"snapshot:{key}", json.dumps(value, ensure_ascii=False, separators=(",", ":")))

    def market_ids(self, markets):
        selected = [market for group in markets for market in (("SH", "SZ", "BJ") if group == "CN" else (group,))]
        placeholders = ",".join("?" for _ in selected)
        with self.connect() as connection:
            rows = connection.execute(f"SELECT id FROM instruments WHERE market IN ({placeholders}) ORDER BY id", selected).fetchall()
        return [row["id"] for row in rows]

    def stats(self):
        with self.connect() as connection:
            catalog = connection.execute("SELECT COUNT(*) AS count FROM instruments").fetchone()["count"]
            candles = connection.execute("SELECT COUNT(*) AS count FROM candles").fetchone()["count"]
            markets = connection.execute("""
                SELECT i.market, COUNT(DISTINCT i.id) AS instruments,
                    COUNT(DISTINCT CASE WHEN s.row_count > 0 THEN i.id END) AS with_history,
                    COALESCE(SUM(s.row_count), 0) AS rows
                FROM instruments i LEFT JOIN ingestion_state s
                    ON s.instrument_id=i.id AND s.period='day' AND s.adjustment='none'
                GROUP BY i.market
            """).fetchall()
        return {
            "instruments": catalog, "candles": candles,
            "databaseBytes": self.path.stat().st_size,
            "markets": {row["market"]: {"instruments": row["instruments"], "withHistory": row["with_history"], "rows": row["rows"]} for row in markets},
        }

    def save_fundamentals(self, records):
        timestamp = self.now()
        rows = [(item["instrumentId"], json.dumps({key: value for key, value in item.items() if key != "instrumentId"}, ensure_ascii=False, separators=(",", ":")), timestamp) for item in records]
        if not rows:
            return
        with self.connect() as connection:
            connection.executemany("INSERT INTO fundamentals(instrument_id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(instrument_id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at", rows)

    def fundamentals(self):
        with self.connect() as connection:
            rows = connection.execute("SELECT instrument_id, payload FROM fundamentals").fetchall()
        return {row["instrument_id"]: json.loads(row["payload"]) for row in rows}

    def save_sector_members(self, name, instrument_ids):
        with self.connect() as connection:
            connection.execute("DELETE FROM sector_members WHERE sector_name=?", (name,))
            connection.executemany("INSERT INTO sector_members(sector_name, instrument_id, updated_at) VALUES (?, ?, ?)", [(name, instrument_id, self.now()) for instrument_id in instrument_ids])

    def sector_members(self, names=None):
        with self.connect() as connection:
            if names:
                placeholders = ",".join("?" for _ in names)
                rows = connection.execute(f"SELECT sector_name, instrument_id FROM sector_members WHERE sector_name IN ({placeholders})", names).fetchall()
            else:
                rows = connection.execute("SELECT sector_name, instrument_id FROM sector_members").fetchall()
        result = {}
        for row in rows:
            result.setdefault(row["sector_name"], set()).add(row["instrument_id"])
        return result
