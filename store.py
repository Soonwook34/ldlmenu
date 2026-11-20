"""SQLite 저장소와 투표 집계 로직.

DB에는 '지금' 필요한 것만 남긴다: 메뉴, 사용자, 설정, 그리고 현재 회차의 투표.
- 회차가 바뀌면(설정한 초기화 시각이 지나면) 이전 회차 투표는 다음 요청 때 삭제된다.
- 수동 초기화는 투표를 즉시 전부 삭제한다.
- 메뉴/사용자 삭제 시 그 메뉴/사용자의 투표도 함께 삭제된다.

진행 단계(phase, 회차마다 처음엔 open):
  open ──마감──▶ closed (1등이 하나)
    └───마감──▶ runoff (공동 1등만 후보, 1인 1표) ──마감──▶ closed / 다시 runoff
  closed ──마감 취소──▶ 마감 직전 단계로 복귀.  runoff에서는 랜덤으로 정할 수도 있다.
  결승으로 넘어갈 때 그 전 투표는 집계 결과(prelim)만 남기고 삭제한다.
"""
import json
import os
import random
import re
import sqlite3
import time
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))  # 한국은 서머타임이 없어 고정 오프셋으로 충분
DEFAULT_ROUNDS = [{"name": "점심", "reset": "14:00"}, {"name": "저녁", "reset": "20:00"}]
MAX_ROUNDS = 6
NAME_MAX = 20
SCHEMA_VERSION = 2
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
    UNIQUE (category_id, name)
);
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS votes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    menu_id INTEGER NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    created_at REAL NOT NULL,
    PRIMARY KEY (user_id, menu_id)
);
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
            _migrate_v120(conn)
            conn.executescript(SCHEMA)
            if conn.execute("SELECT COUNT(*) FROM categories").fetchone()[0] == 0:
                _seed(conn, seed_dir)
            if _get_setting(conn, "rounds") is None:
                _set_setting(conn, "rounds", DEFAULT_ROUNDS)
    finally:
        conn.close()


def _migrate_v120(conn):
    """v1.2.0 스키마(비활성화 플래그, 투표 id 컬럼)를 쓰던 DB를 한 번만 정리한다."""
    if conn.execute("PRAGMA user_version").fetchone()[0] >= SCHEMA_VERSION:
        return
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    if "menus" in tables:
        conn.execute("DROP TABLE IF EXISTS votes")  # 회차 투표는 보존하지 않는다
        for table in ("menus", "users"):
            cols = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
            if "active" in cols:
                conn.execute(f"DELETE FROM {table} WHERE active = 0")
                if sqlite3.sqlite_version_info >= (3, 35):
                    conn.execute(f"ALTER TABLE {table} DROP COLUMN active")
        conn.execute("DELETE FROM settings WHERE key = 'manual_reset_at'")
    conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")


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


def _is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def _id_list(values, label):
    if not isinstance(values, list) or not all(_is_int(v) for v in values):
        raise StoreError(f"{label} 형식이 올바르지 않습니다.")
    return sorted(set(values))


# ---------------------------------------------------------------- 회차

def _parse_hm(hm):
    h, m = hm.split(":")
    return int(h), int(m)


def get_rounds(conn):
    return sorted(_get_setting(conn, "rounds") or [], key=lambda r: r["reset"])


def round_info(conn, now=None):
    """현재 회차 정보. now는 epoch 초(테스트용). 회차가 없으면 자동 초기화 없음."""
    now = time.time() if now is None else now
    rounds = get_rounds(conn)
    if not rounds:
        return {"name": "투표", "start": 0, "next_reset": None, "next_reset_label": None}

    now_dt = datetime.fromtimestamp(now, KST)
    boundaries = []  # (datetime, round)
    for day_offset in (-1, 0, 1):
        day = now_dt.date() + timedelta(days=day_offset)
        for r in rounds:
            h, m = _parse_hm(r["reset"])
            boundaries.append((datetime(day.year, day.month, day.day, h, m, tzinfo=KST), r))
    last = max(b[0] for b in boundaries if b[0] <= now_dt)
    nxt_dt, nxt_round = min((b for b in boundaries if b[0] > now_dt), key=lambda b: b[0])
    return {
        "name": nxt_round["name"],
        "start": last.timestamp(),
        "next_reset": nxt_dt.timestamp(),
        "next_reset_label": nxt_dt.strftime("%H:%M"),
    }


def _purge(conn, start):
    """현재 회차 시작 이전의 투표를 지운다. 폴링마다 쓰기 잠금을 잡지 않도록 지울 게 있을 때만."""
    if conn.execute("SELECT 1 FROM votes WHERE created_at < ? LIMIT 1", (start,)).fetchone():
        with conn:
            conn.execute("DELETE FROM votes WHERE created_at < ?", (start,))


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


def reset_now(conn):
    with conn:
        conn.execute("DELETE FROM votes")
        conn.execute("DELETE FROM settings WHERE key = 'phase'")


# ---------------------------------------------------------------- 조회

def get_users(conn):
    return [dict(r) for r in conn.execute("SELECT id, name FROM users ORDER BY name")]


def get_user(conn, user_id):
    row = conn.execute("SELECT id, name FROM users WHERE id = ?", (user_id,)).fetchone()
    return None if row is None else dict(row)


def find_user_by_name(conn, name):
    row = conn.execute("SELECT id, name FROM users WHERE name = ?", (name,)).fetchone()
    return None if row is None else dict(row)


def get_categories(conn):
    """[{id, name, menus: [{id, name}]}] (메뉴는 이름순)"""
    cats = [dict(r, menus=[]) for r in conn.execute("SELECT id, name FROM categories ORDER BY sort_order, id")]
    by_id = {c["id"]: c for c in cats}
    for r in conn.execute("SELECT id, category_id, name FROM menus ORDER BY name"):
        by_id[r["category_id"]]["menus"].append({"id": r["id"], "name": r["name"]})
    return cats


def _tally(conn):
    """현재 투표 집계: (menu_id -> [투표자 이름], user_id -> 이름, user_id -> [menu_id])"""
    rows = conn.execute(
        "SELECT v.menu_id, v.user_id, u.name AS user_name FROM votes v "
        "JOIN users u ON u.id = v.user_id ORDER BY v.created_at, u.name"
    ).fetchall()
    voters_by_menu, voter_names, selections = {}, {}, {}
    for r in rows:
        voters_by_menu.setdefault(r["menu_id"], []).append(r["user_name"])
        voter_names[r["user_id"]] = r["user_name"]
        selections.setdefault(r["user_id"], []).append(r["menu_id"])
    return voters_by_menu, voter_names, selections


def _phase(conn, start):
    """현재 회차의 진행 단계. 회차가 바뀌었으면 open으로 돌아간다."""
    phase = _get_setting(conn, "phase")
    if not phase or phase.get("round_start") != start:
        return {"status": "open", "round_start": start, "stage": 0}
    return phase


def get_state(conn, now=None):
    """화면 하나를 그리는 데 필요한 모든 것: 회차, 진행 단계, 설정, 사용자, 카테고리별 집계, 순위."""
    rnd = round_info(conn, now)
    _purge(conn, rnd["start"])
    voters_by_menu, voter_names, selections = _tally(conn)

    categories = get_categories(conn)
    all_menus = []
    for c in categories:
        for m in c["menus"]:
            m["voters"] = voters_by_menu.get(m["id"], [])
            m["votes"] = len(m["voters"])
            all_menus.append(dict(m, category=c["name"]))
    by_id = {m["id"]: m for m in all_menus}

    phase = _phase(conn, rnd["start"])
    winner = by_id.get(phase.get("winner_id"))
    return {
        "round": rnd,
        "phase": {
            "status": phase["status"],
            "stage": phase.get("stage", 0),  # 결승 몇 번째인지 (1 = 첫 결승)
            "candidates": [i for i in phase.get("candidates", []) if i in by_id],
            "prelim": phase.get("prelim", []),  # 결승 직전 투표 결과 [{id, name, category, votes}]
            "winner": winner and {"id": winner["id"], "name": winner["name"], "category": winner["category"]},
            "decided_by": phase.get("decided_by"),
            "can_reopen": phase["status"] == "closed" and "prev" in phase,
        },
        "rounds": get_rounds(conn),
        "users": get_users(conn),
        "categories": categories,
        "voters": sorted(voter_names.values()),
        "selections": selections,  # user_id -> [menu_id]
        "max_votes": max((m["votes"] for m in all_menus), default=0),
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
    """해당 사용자의 투표를 menu_ids로 교체한다. 빈 목록이면 투표 취소."""
    menu_ids = _id_list(menu_ids, "메뉴")
    if not _is_int(user_id) or get_user(conn, user_id) is None:
        raise StoreError("사용자를 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.", 404)
    if menu_ids:
        placeholders = ",".join("?" * len(menu_ids))
        found = conn.execute(f"SELECT COUNT(*) FROM menus WHERE id IN ({placeholders})", menu_ids).fetchone()[0]
        if found != len(menu_ids):
            raise StoreError("삭제된 메뉴가 포함되어 있습니다. 새로고침 후 다시 선택해 주세요.", 409)
    now = time.time() if now is None else now
    start = round_info(conn, now)["start"]
    _purge(conn, start)
    phase = _phase(conn, start)
    if phase["status"] == "closed":
        raise StoreError("투표가 마감됐어요. 새로고침해 주세요.", 409)
    if phase["status"] == "runoff":
        if len(menu_ids) > 1:
            raise StoreError("결승에서는 한 메뉴만 고를 수 있어요.")
        if not set(menu_ids) <= set(phase["candidates"]):
            raise StoreError("결승 후보가 아닌 메뉴예요. 새로고침해 주세요.", 409)
    with conn:
        conn.execute("DELETE FROM votes WHERE user_id = ?", (user_id,))
        conn.executemany(
            "INSERT INTO votes (user_id, menu_id, created_at) VALUES (?, ?, ?)",
            [(user_id, mid, now) for mid in menu_ids],
        )


def close_vote(conn, pick_random=False, now=None):
    """투표 마감. 1등이 하나면 확정, 공동 1등이면 결승(runoff)을 연다. pick_random이면 1등 후보 중 무작위 확정."""
    start = round_info(conn, now)["start"]
    _purge(conn, start)
    phase = _phase(conn, start)
    if phase["status"] == "closed":
        raise StoreError("이미 마감됐어요.", 409)

    existing = {m["id"]: dict(m, category=c["name"]) for c in get_categories(conn) for m in c["menus"]}
    voters_by_menu = _tally(conn)[0]
    pool = [i for i in phase.get("candidates", existing) if i in existing] if phase["status"] == "runoff" else list(existing)
    votes = {i: len(voters_by_menu.get(i, [])) for i in pool}
    top = max(votes.values(), default=0)
    tied = sorted(i for i, v in votes.items() if v == top and v > 0)

    if pick_random:
        if phase["status"] != "runoff":
            raise StoreError("랜덤 결정은 결승에서만 할 수 있어요.")
        winner, decided_by = random.choice(tied or pool), "random"
    elif not tied:
        raise StoreError("결승 투표가 아직 없어요." if phase["status"] == "runoff" else "아직 투표가 없어요.")
    elif len(tied) == 1:
        winner, decided_by = tied[0], "vote"
    else:
        prelim = sorted(
            ({"id": i, "name": existing[i]["name"], "category": existing[i]["category"], "votes": v}
             for i, v in votes.items() if v > 0),
            key=lambda m: (-m["votes"], m["name"]),
        )
        with conn:
            _set_setting(conn, "phase", {
                "round_start": start, "status": "runoff", "stage": phase.get("stage", 0) + 1,
                "candidates": tied, "prelim": prelim,
            })
            conn.execute("DELETE FROM votes")
        return "runoff"

    prev = {k: v for k, v in phase.items() if k != "prev"}
    with conn:
        _set_setting(conn, "phase", dict(prev, status="closed", winner_id=winner, decided_by=decided_by, prev=prev))
    return "closed"


def reopen_vote(conn, now=None):
    """마감 취소: 마감 직전 단계(투표 중 또는 결승)로 되돌린다. 투표는 그대로 남아 있다."""
    start = round_info(conn, now)["start"]
    phase = _phase(conn, start)
    if phase["status"] != "closed" or "prev" not in phase:
        raise StoreError("마감된 투표가 없어요.", 409)
    with conn:
        _set_setting(conn, "phase", phase["prev"])


def _require(conn, table, row_id, label):
    if not _is_int(row_id) or conn.execute(f"SELECT 1 FROM {table} WHERE id = ?", (row_id,)).fetchone() is None:
        raise StoreError(f"{label}을(를) 찾을 수 없습니다. 새로고침해 주세요.", 404)


def add_category(conn, name):
    name = _clean_name(name, "카테고리 이름")
    order = conn.execute("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM categories").fetchone()[0]
    try:
        with conn:
            cur = conn.execute("INSERT INTO categories (name, sort_order) VALUES (?, ?)", (name, order))
    except sqlite3.IntegrityError:
        raise StoreError(f"'{name}' 카테고리가 이미 있어요.", 409)
    return cur.lastrowid


def rename_category(conn, category_id, name):
    _require(conn, "categories", category_id, "카테고리")
    name = _clean_name(name, "카테고리 이름")
    try:
        with conn:
            conn.execute("UPDATE categories SET name = ? WHERE id = ?", (name, category_id))
    except sqlite3.IntegrityError:
        raise StoreError(f"'{name}' 카테고리가 이미 있어요.", 409)


def move_category(conn, category_id, offset):
    """카테고리 순서를 offset(-1: 앞으로, 1: 뒤로)만큼 옮긴다."""
    _require(conn, "categories", category_id, "카테고리")
    if offset not in (-1, 1):
        raise StoreError("이동 방향이 올바르지 않습니다.")
    ids = [r[0] for r in conn.execute("SELECT id FROM categories ORDER BY sort_order, id")]
    i = ids.index(category_id)
    j = i + offset
    if 0 <= j < len(ids):
        ids[i], ids[j] = ids[j], ids[i]
        with conn:
            conn.executemany("UPDATE categories SET sort_order = ? WHERE id = ?", [(k, cid) for k, cid in enumerate(ids)])


def delete_category(conn, category_id):
    """카테고리와 그 안의 메뉴(와 그 메뉴의 투표)를 함께 삭제한다."""
    _require(conn, "categories", category_id, "카테고리")
    with conn:
        conn.execute("DELETE FROM menus WHERE category_id = ?", (category_id,))
        conn.execute("DELETE FROM categories WHERE id = ?", (category_id,))


def rename_menu(conn, menu_id, name):
    _require(conn, "menus", menu_id, "메뉴")
    name = _clean_name(name, "메뉴 이름")
    try:
        with conn:
            conn.execute("UPDATE menus SET name = ? WHERE id = ?", (name, menu_id))
    except sqlite3.IntegrityError:
        raise StoreError(f"같은 카테고리에 '{name}'이(가) 이미 있어요.", 409)


def move_menus(conn, menu_ids, category_id):
    """메뉴를 다른 카테고리로 옮긴다. 투표는 그대로 유지된다. 이름이 겹치면 아무것도 옮기지 않는다."""
    menu_ids = _id_list(menu_ids, "메뉴")
    if not menu_ids:
        raise StoreError("옮길 메뉴를 선택해 주세요.")
    _require(conn, "categories", category_id, "카테고리")
    placeholders = ",".join("?" * len(menu_ids))
    moving = conn.execute(f"SELECT id, name FROM menus WHERE id IN ({placeholders})", menu_ids).fetchall()
    if len(moving) != len(menu_ids):
        raise StoreError("삭제된 메뉴가 포함되어 있습니다. 새로고침해 주세요.", 409)
    clash = conn.execute(
        f"SELECT name FROM menus WHERE category_id = ? AND id NOT IN ({placeholders}) "
        f"AND name IN (SELECT name FROM menus WHERE id IN ({placeholders})) ORDER BY name",
        [category_id] + menu_ids + menu_ids,
    ).fetchall()
    if clash:
        raise StoreError(f"옮길 카테고리에 같은 이름이 있어요: {', '.join(r[0] for r in clash)}", 409)
    with conn:
        conn.executemany("UPDATE menus SET category_id = ? WHERE id = ?", [(category_id, i) for i in menu_ids])
    return len(menu_ids)


def rename_user(conn, user_id, name):
    _require(conn, "users", user_id, "사용자")
    name = _clean_name(name, "이름")
    try:
        with conn:
            conn.execute("UPDATE users SET name = ? WHERE id = ?", (name, user_id))
    except sqlite3.IntegrityError:
        raise StoreError(f"'{name}' 님이 이미 있어요.", 409)


def add_menu(conn, category_id, name):
    name = _clean_name(name, "메뉴 이름")
    if not _is_int(category_id) or conn.execute("SELECT 1 FROM categories WHERE id = ?", (category_id,)).fetchone() is None:
        raise StoreError("카테고리를 찾을 수 없습니다.", 404)
    try:
        with conn:
            conn.execute("INSERT INTO menus (category_id, name) VALUES (?, ?)", (category_id, name))
    except sqlite3.IntegrityError:
        raise StoreError(f"'{name}'은(는) 이미 있는 메뉴입니다.", 409)
    return name


def delete_menus(conn, menu_ids):
    menu_ids = _id_list(menu_ids, "메뉴")
    if not menu_ids:
        raise StoreError("삭제할 메뉴를 선택해 주세요.")
    with conn:
        conn.executemany("DELETE FROM menus WHERE id = ?", [(i,) for i in menu_ids])


def add_user(conn, name):
    name = _clean_name(name, "이름")
    try:
        with conn:
            cur = conn.execute("INSERT INTO users (name) VALUES (?)", (name,))
    except sqlite3.IntegrityError:
        raise StoreError(f"'{name}'은(는) 이미 있는 사용자입니다.", 409)
    return {"id": cur.lastrowid, "name": name}


def delete_users(conn, user_ids):
    user_ids = _id_list(user_ids, "사용자")
    if not user_ids:
        raise StoreError("삭제할 사용자를 선택해 주세요.")
    with conn:
        conn.executemany("DELETE FROM users WHERE id = ?", [(i,) for i in user_ids])
