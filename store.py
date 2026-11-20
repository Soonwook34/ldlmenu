"""SQLite 저장소와 투표 집계 로직.

- 메뉴/사용자는 삭제 시 비활성화(active=0)만 한다. 같은 이름으로 다시 추가하면 복구된다.
- 투표는 지우지 않고 created_at으로 회차를 구분한다. 현재 회차 시작 시각 이후의 투표만 집계한다.
- 회차 시작 시각 = max(가장 최근 자동 초기화 시각, 마지막 수동 초기화 시각).
"""
import json
import os
import re
import sqlite3
import time
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))  # 한국은 서머타임이 없어 고정 오프셋으로 충분
DEFAULT_ROUNDS = [{"name": "점심", "reset": "14:00"}, {"name": "저녁", "reset": "20:00"}]
MAX_ROUNDS = 6
NAME_MAX = 20
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")

SCHEMA = """
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS menus (
    id INTEGER PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    UNIQUE (category_id, name)
);
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    menu_id INTEGER NOT NULL REFERENCES menus(id),
    created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_votes_created ON votes(created_at);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


class StoreError(Exception):
    """사용자에게 그대로 보여줄 수 있는 검증 오류."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def connect(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(db_path, seed_dir):
    """스키마를 만들고, 비어 있으면 menu.json / user.json으로 초기 데이터를 넣는다."""
    conn = connect(db_path)
    try:
        with conn:
            conn.executescript(SCHEMA)
            if conn.execute("SELECT COUNT(*) FROM categories").fetchone()[0] == 0:
                _seed(conn, seed_dir)
            if _get_setting(conn, "rounds") is None:
                _set_setting(conn, "rounds", DEFAULT_ROUNDS)
            if _get_setting(conn, "manual_reset_at") is None:
                _set_setting(conn, "manual_reset_at", 0)
    finally:
        conn.close()


def _seed(conn, seed_dir):
    menu_path = os.path.join(seed_dir, "menu.json")
    user_path = os.path.join(seed_dir, "user.json")
    if os.path.exists(menu_path):
        with open(menu_path, encoding="utf8") as f:
            menu = json.load(f)
        for order, (category, foods) in enumerate(menu.items()):
            cur = conn.execute("INSERT INTO categories (name, sort_order) VALUES (?, ?)", (category, order))
            conn.executemany(
                "INSERT OR IGNORE INTO menus (category_id, name) VALUES (?, ?)",
                [(cur.lastrowid, food) for food in foods],
            )
    if os.path.exists(user_path):
        with open(user_path, encoding="utf8") as f:
            users = json.load(f)
        conn.executemany("INSERT OR IGNORE INTO users (name) VALUES (?)", [(u,) for u in users])


def _get_setting(conn, key):
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return None if row is None else json.loads(row["value"])


def _set_setting(conn, key, value):
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, json.dumps(value, ensure_ascii=False)),
    )


def _clean_name(value, label):
    if not isinstance(value, str):
        raise StoreError(f"{label}을(를) 입력해 주세요.")
    name = " ".join(value.split())
    if not name:
        raise StoreError(f"{label}을(를) 입력해 주세요.")
    if len(name) > NAME_MAX:
        raise StoreError(f"{label}은(는) {NAME_MAX}자 이하로 입력해 주세요.")
    return name


def _id_list(values, label):
    if not isinstance(values, list) or not all(isinstance(v, int) and not isinstance(v, bool) for v in values):
        raise StoreError(f"{label} 형식이 올바르지 않습니다.")
    return sorted(set(values))


# ---------------------------------------------------------------- 회차

def _parse_hm(hm):
    h, m = hm.split(":")
    return int(h), int(m)


def round_info(conn, now=None):
    """현재 회차 정보. now는 epoch 초(테스트용)."""
    now = time.time() if now is None else now
    rounds = sorted(_get_setting(conn, "rounds") or [], key=lambda r: r["reset"])
    manual = float(_get_setting(conn, "manual_reset_at") or 0)
    now_dt = datetime.fromtimestamp(now, KST)

    last_auto, next_reset, name = None, None, "투표"
    if rounds:
        today = now_dt.date()
        boundaries = []  # (datetime, round)
        for day_offset in (-1, 0, 1):
            day = today + timedelta(days=day_offset)
            for r in rounds:
                h, m = _parse_hm(r["reset"])
                boundaries.append((datetime(day.year, day.month, day.day, h, m, tzinfo=KST), r))
        past = [b for b in boundaries if b[0] <= now_dt]
        future = [b for b in boundaries if b[0] > now_dt]
        last_auto = max(past, key=lambda b: b[0])[0].timestamp()
        nxt = min(future, key=lambda b: b[0])
        next_reset, name = nxt[0].timestamp(), nxt[1]["name"]

    start = max(last_auto or 0, manual)
    return {
        "name": name,
        "start": start,
        "next_reset": next_reset,
        "next_reset_label": None if next_reset is None else datetime.fromtimestamp(next_reset, KST).strftime("%H:%M"),
    }


def get_rounds(conn):
    return sorted(_get_setting(conn, "rounds") or [], key=lambda r: r["reset"])


def set_rounds(conn, rounds):
    if not isinstance(rounds, list) or len(rounds) > MAX_ROUNDS:
        raise StoreError(f"회차는 최대 {MAX_ROUNDS}개까지 설정할 수 있습니다.")
    cleaned, seen = [], set()
    for r in rounds:
        if not isinstance(r, dict):
            raise StoreError("회차 형식이 올바르지 않습니다.")
        name = _clean_name(r.get("name"), "회차 이름")
        reset = r.get("reset")
        if not isinstance(reset, str) or not TIME_RE.match(reset):
            raise StoreError(f"'{name}'의 초기화 시각을 HH:MM 형식으로 입력해 주세요.")
        if reset in seen:
            raise StoreError(f"초기화 시각 {reset}이(가) 중복됩니다.")
        seen.add(reset)
        cleaned.append({"name": name, "reset": reset})
    cleaned.sort(key=lambda r: r["reset"])
    with conn:
        _set_setting(conn, "rounds", cleaned)
    return cleaned


def reset_now(conn, now=None):
    with conn:
        _set_setting(conn, "manual_reset_at", time.time() if now is None else now)


# ---------------------------------------------------------------- 조회

def get_users(conn):
    return [dict(r) for r in conn.execute("SELECT id, name FROM users WHERE active = 1 ORDER BY name")]


def get_user(conn, user_id):
    row = conn.execute("SELECT id, name FROM users WHERE id = ? AND active = 1", (user_id,)).fetchone()
    return None if row is None else dict(row)


def find_user_by_name(conn, name):
    row = conn.execute("SELECT id, name FROM users WHERE name = ? AND active = 1", (name,)).fetchone()
    return None if row is None else dict(row)


def get_categories(conn):
    """[{id, name, menus: [{id, name}]}] (메뉴는 이름순)"""
    cats = [dict(r, menus=[]) for r in conn.execute("SELECT id, name FROM categories ORDER BY sort_order, id")]
    by_id = {c["id"]: c for c in cats}
    for r in conn.execute("SELECT id, category_id, name FROM menus WHERE active = 1 ORDER BY name"):
        by_id[r["category_id"]]["menus"].append({"id": r["id"], "name": r["name"]})
    return cats


def get_state(conn, now=None):
    """화면 하나를 그리는 데 필요한 모든 것: 회차, 사용자, 카테고리별 집계, 순위."""
    rnd = round_info(conn, now)
    rows = conn.execute(
        "SELECT v.menu_id, u.id AS user_id, u.name AS user_name FROM votes v "
        "JOIN users u ON u.id = v.user_id AND u.active = 1 "
        "JOIN menus m ON m.id = v.menu_id AND m.active = 1 "
        "WHERE v.created_at >= ? ORDER BY v.created_at",
        (rnd["start"],),
    ).fetchall()

    voters_by_menu = {}
    voter_names = {}
    for r in rows:
        voters_by_menu.setdefault(r["menu_id"], []).append(r["user_name"])
        voter_names[r["user_id"]] = r["user_name"]
    selections = {}
    for r in rows:
        selections.setdefault(r["user_id"], []).append(r["menu_id"])

    categories = get_categories(conn)
    all_menus = []
    for c in categories:
        for m in c["menus"]:
            m["voters"] = voters_by_menu.get(m["id"], [])
            m["votes"] = len(m["voters"])
            m["category"] = c["name"]
            all_menus.append(m)

    max_votes = max((m["votes"] for m in all_menus), default=0)
    return {
        "round": rnd,
        "users": get_users(conn),
        "categories": categories,
        "voters": sorted(voter_names.values()),
        "selections": selections,  # user_id -> [menu_id]
        "max_votes": max_votes,
        "ranking": ranking(all_menus),
    }


def ranking(menus, top=3):
    """득표가 있는 메뉴만, 공동 순위(1,1,3) 기준으로 top위 이내 전부. 동점은 잘리지 않는다."""
    voted = sorted((m for m in menus if m["votes"] > 0), key=lambda m: (-m["votes"], m["name"]))
    result, rank = [], 0
    for i, m in enumerate(voted):
        if i == 0 or m["votes"] < voted[i - 1]["votes"]:
            rank = i + 1
        if rank > top:
            break
        result.append(dict(m, rank=rank))
    return result


# ---------------------------------------------------------------- 변경

def submit_vote(conn, user_id, menu_ids, now=None):
    """현재 회차의 해당 사용자 투표를 menu_ids로 교체한다. 빈 목록이면 투표 취소."""
    menu_ids = _id_list(menu_ids, "메뉴")
    if not isinstance(user_id, int) or isinstance(user_id, bool) or get_user(conn, user_id) is None:
        raise StoreError("사용자를 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.", 404)
    if menu_ids:
        placeholders = ",".join("?" * len(menu_ids))
        found = conn.execute(
            f"SELECT COUNT(*) FROM menus WHERE active = 1 AND id IN ({placeholders})", menu_ids
        ).fetchone()[0]
        if found != len(menu_ids):
            raise StoreError("삭제된 메뉴가 포함되어 있습니다. 새로고침 후 다시 선택해 주세요.", 409)
    now = time.time() if now is None else now
    start = round_info(conn, now)["start"]
    with conn:
        conn.execute("DELETE FROM votes WHERE user_id = ? AND created_at >= ?", (user_id, start))
        conn.executemany(
            "INSERT INTO votes (user_id, menu_id, created_at) VALUES (?, ?, ?)",
            [(user_id, mid, now) for mid in menu_ids],
        )


def add_menu(conn, category_id, name):
    name = _clean_name(name, "메뉴 이름")
    if conn.execute("SELECT 1 FROM categories WHERE id = ?", (category_id,)).fetchone() is None:
        raise StoreError("카테고리를 찾을 수 없습니다.", 404)
    row = conn.execute("SELECT id, active FROM menus WHERE category_id = ? AND name = ?", (category_id, name)).fetchone()
    with conn:
        if row is None:
            conn.execute("INSERT INTO menus (category_id, name) VALUES (?, ?)", (category_id, name))
        elif row["active"]:
            raise StoreError(f"'{name}'은(는) 이미 있는 메뉴입니다.", 409)
        else:
            conn.execute("UPDATE menus SET active = 1 WHERE id = ?", (row["id"],))
    return name


def delete_menus(conn, menu_ids):
    menu_ids = _id_list(menu_ids, "메뉴")
    if not menu_ids:
        raise StoreError("삭제할 메뉴를 선택해 주세요.")
    with conn:
        conn.executemany("UPDATE menus SET active = 0 WHERE id = ?", [(i,) for i in menu_ids])


def add_user(conn, name):
    name = _clean_name(name, "이름")
    row = conn.execute("SELECT id, active FROM users WHERE name = ?", (name,)).fetchone()
    with conn:
        if row is None:
            conn.execute("INSERT INTO users (name) VALUES (?)", (name,))
        elif row["active"]:
            raise StoreError(f"'{name}'은(는) 이미 있는 사용자입니다.", 409)
        else:
            conn.execute("UPDATE users SET active = 1 WHERE id = ?", (row["id"],))
    return name


def delete_users(conn, user_ids):
    user_ids = _id_list(user_ids, "사용자")
    if not user_ids:
        raise StoreError("삭제할 사용자를 선택해 주세요.")
    with conn:
        conn.executemany("UPDATE users SET active = 0 WHERE id = ?", [(i,) for i in user_ids])
