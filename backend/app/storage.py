"""
SQLite 持久化存储 — 替代单文件 games.json 的全量读写。

设计:
  - 每局一条记录,完整 JSON 存在 payload 列;game_id 为主键,status/created_at
    拆出冗余列并建索引,便于后续按状态/时间过滤与排序。
  - 同步 sqlite3 + threading.Lock + WAL;由调用方通过 asyncio.to_thread
    把写操作移出事件循环,避免阻塞 FastAPI。
  - 提供一次性 JSON → SQLite 迁移(幂等: 仅在库为空时导入)。
"""
from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

_SCHEMA = """
CREATE TABLE IF NOT EXISTS games (
    game_id    TEXT PRIMARY KEY,
    status     TEXT,
    created_at TEXT,
    payload    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON games(created_at);
"""


class SQLiteGameStore:
    """线程安全的 SQLite 存储,记录以 JSON payload 落库。"""

    def __init__(self, db_path: Path):
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        self._lock = threading.Lock()
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA busy_timeout=5000")
            self._conn.executescript(_SCHEMA)
            self._conn.commit()

    # ------------------------------------------------------------------
    # 读
    # ------------------------------------------------------------------
    def count(self) -> int:
        """当前记录条数(用于判断是否需要迁移)。"""
        with self._lock:
            cur = self._conn.execute("SELECT COUNT(*) FROM games")
            return int(cur.fetchone()[0])

    def load_all(self) -> List[Dict[str, Any]]:
        """读取全部记录,按插入顺序返回(等价原 JSON 追加顺序)。"""
        with self._lock:
            cur = self._conn.execute("SELECT payload FROM games ORDER BY rowid")
            return [json.loads(row[0]) for row in cur.fetchall()]

    def load_record(self, game_id: str) -> Optional[Dict[str, Any]]:
        """按主键读取单条记录。"""
        with self._lock:
            cur = self._conn.execute(
                "SELECT payload FROM games WHERE game_id = ?", (game_id,)
            )
            row = cur.fetchone()
            return json.loads(row[0]) if row else None

    # ------------------------------------------------------------------
    # 写
    # ------------------------------------------------------------------
    def _upsert(self, record: Dict[str, Any]) -> None:
        payload = json.dumps(record, ensure_ascii=False)
        self._conn.execute(
            """
            INSERT INTO games (game_id, status, created_at, payload)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(game_id) DO UPDATE SET
                status = excluded.status,
                created_at = excluded.created_at,
                payload = excluded.payload
            """,
            (
                record.get("game_id", ""),
                record.get("status"),
                record.get("created_at"),
                payload,
            ),
        )

    def save_record(self, record: Dict[str, Any]) -> None:
        """新增或整条覆盖一条记录。"""
        with self._lock:
            self._upsert(record)
            self._conn.commit()

    def save_many(self, records: List[Dict[str, Any]]) -> None:
        """批量 upsert(单事务)。"""
        with self._lock:
            for record in records:
                self._upsert(record)
            self._conn.commit()

    def update_record(self, game_id: str, fields: Dict[str, Any]) -> bool:
        """读-改-写单条记录的部分字段。返回是否命中。"""
        with self._lock:
            cur = self._conn.execute(
                "SELECT payload FROM games WHERE game_id = ?", (game_id,)
            )
            row = cur.fetchone()
            if row is None:
                return False
            record = json.loads(row[0])
            record.update(fields)
            self._upsert(record)
            self._conn.commit()
            return True

    def delete_record(self, game_id: str) -> bool:
        """删除单条记录。返回是否命中。"""
        with self._lock:
            cur = self._conn.execute(
                "DELETE FROM games WHERE game_id = ?", (game_id,)
            )
            self._conn.commit()
            return cur.rowcount > 0

    def replace_all(self, records: List[Dict[str, Any]]) -> None:
        """用给定记录整体替换存储(兼容旧的 _write_all 语义)。"""
        with self._lock:
            self._conn.execute("DELETE FROM games")
            for record in records:
                self._upsert(record)
            self._conn.commit()

    # ------------------------------------------------------------------
    # 迁移
    # ------------------------------------------------------------------
    def migrate_from_json(self, json_path: Path) -> int:
        """从旧版 games.json 导入全部记录,返回导入条数。"""
        json_path = Path(json_path)
        if not json_path.exists():
            return 0
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                records = json.load(f)
        except (json.JSONDecodeError, OSError):
            return 0
        if not isinstance(records, list):
            return 0
        self.save_many(records)
        return len(records)
