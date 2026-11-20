import json
import os
import sqlite3
import sys
from datetime import datetime
from urllib.parse import quote

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
os.environ.setdefault("LDLMENU_DB", ":memory:")  # import 시 생성되는 전역 app이 실제 DB를 건드리지 않도록

import flask_app  # noqa: E402
import store  # noqa: E402


def kst(y, mo, d, h, mi):
    return datetime(y, mo, d, h, mi, tzinfo=store.KST).timestamp()


@pytest.fixture
def seed_dir(tmp_path):
    d = tmp_path / "seed"
    d.mkdir()
    (d / "menu.json").write_text(json.dumps({"배달": ["피자", "치킨"], "나가먹": ["국밥"]}, ensure_ascii=False))
    (d / "user.json").write_text(json.dumps(["가", "나", "다"], ensure_ascii=False))
    return d


@pytest.fixture
def conn(tmp_path, seed_dir):
    path = str(tmp_path / "t.db")
    store.init_db(path, str(seed_dir))
    c = store.connect(path)
    yield c
    c.close()


@pytest.fixture
def client(tmp_path, seed_dir, monkeypatch):
    index = tmp_path / "index.html"
    index.write_text("<html><head><!--app-state--></head><body></body></html>")
    monkeypatch.setattr(flask_app, "BASE_DIR", str(seed_dir))
    monkeypatch.setattr(flask_app, "APP_INDEX", str(index))
    return flask_app.create_app(str(tmp_path / "app.db")).test_client()


def ids(conn):
    users = {u["name"]: u["id"] for u in store.get_users(conn)}
    menus = {m["name"]: m["id"] for c in store.get_categories(conn) for m in c["menus"]}
    return users, menus


def tally(state):
    return {m["name"]: m["votes"] for c in state["categories"] for m in c["menus"]}


def vote_rows(conn):
    return conn.execute("SELECT COUNT(*) FROM votes").fetchone()[0]


# ---------------------------------------------------------------- 회차

def test_round_boundaries(conn):
    # 기본: 점심 14:00, 저녁 20:00 초기화
    r = store.round_info(conn, kst(2026, 11, 20, 11, 0))
    assert r["name"] == "점심" and r["next_reset_label"] == "14:00"
    assert r["start"] == kst(2026, 11, 19, 20, 0)

    r = store.round_info(conn, kst(2026, 11, 20, 15, 0))
    assert r["name"] == "저녁" and r["start"] == kst(2026, 11, 20, 14, 0)

    r = store.round_info(conn, kst(2026, 11, 20, 22, 0))  # 밤에는 다음날 점심 회차
    assert r["name"] == "점심" and r["next_reset"] == kst(2026, 11, 21, 14, 0)


def test_votes_are_deleted_after_reset_time(conn):
    users, menus = ids(conn)
    store.submit_vote(conn, users["가"], [menus["피자"]], now=kst(2026, 11, 20, 11, 0))
    assert tally(store.get_state(conn, kst(2026, 11, 20, 13, 59)))["피자"] == 1
    assert tally(store.get_state(conn, kst(2026, 11, 20, 14, 0)))["피자"] == 0
    assert vote_rows(conn) == 0  # 집계에서 빠지는 게 아니라 DB에서 지워진다


def test_no_rounds_means_no_auto_reset(conn):
    users, menus = ids(conn)
    store.set_rounds(conn, [])
    store.submit_vote(conn, users["가"], [menus["피자"]], now=kst(2026, 11, 20, 11, 0))
    state = store.get_state(conn, kst(2026, 12, 25, 11, 0))
    assert tally(state)["피자"] == 1 and state["round"]["next_reset"] is None


def test_manual_reset_deletes_votes(conn):
    users, menus = ids(conn)
    store.submit_vote(conn, users["가"], [menus["피자"]])
    store.reset_now(conn)
    assert vote_rows(conn) == 0


@pytest.mark.parametrize("rounds", [
    [{"name": "점심", "reset": "25:00"}],
    [{"name": "", "reset": "12:00"}],
    [{"name": "a", "reset": "12:00"}, {"name": "b", "reset": "12:00"}],
    "nope",
])
def test_invalid_rounds(conn, rounds):
    with pytest.raises(store.StoreError):
        store.set_rounds(conn, rounds)


# ---------------------------------------------------------------- 투표

def test_revote_replaces_and_cancel(conn):
    users, menus = ids(conn)
    t = kst(2026, 11, 20, 11, 0)
    store.submit_vote(conn, users["가"], [menus["피자"], menus["치킨"]], now=t)
    store.submit_vote(conn, users["가"], [menus["국밥"]], now=t + 60)
    state = store.get_state(conn, t + 120)
    assert tally(state) == {"피자": 0, "치킨": 0, "국밥": 1}
    assert state["voters"] == ["가"] and state["selections"] == {users["가"]: [menus["국밥"]]}

    store.submit_vote(conn, users["가"], [], now=t + 180)
    state = store.get_state(conn, t + 240)
    assert state["voters"] == [] and state["ranking"] == [] and vote_rows(conn) == 0


def test_ranking_ties_not_truncated():
    menus = [{"name": n, "votes": v} for n, v in [("a", 2), ("b", 2), ("c", 1), ("d", 1), ("e", 1), ("f", 0)]]
    assert [(m["name"], m["rank"]) for m in store.ranking(menus)] == [("a", 1), ("b", 1), ("c", 3), ("d", 3), ("e", 3)]
    menus = [{"name": n, "votes": v} for n, v in [("a", 3), ("b", 2), ("c", 2), ("d", 1)]]
    assert [m["rank"] for m in store.ranking(menus)] == [1, 2, 2]
    assert store.ranking([{"name": "a", "votes": 0}]) == []


def test_editing_menus_and_users_keeps_other_votes(conn):
    users, menus = ids(conn)
    t = kst(2026, 11, 20, 11, 0)
    store.submit_vote(conn, users["가"], [menus["피자"], menus["치킨"]], now=t)
    store.submit_vote(conn, users["나"], [menus["피자"]], now=t)

    store.add_menu(conn, store.get_categories(conn)[0]["id"], "떡볶이")
    store.add_user(conn, "라")
    store.delete_menus(conn, [menus["치킨"]])
    store.delete_users(conn, [users["나"]])

    state = store.get_state(conn, t + 60)
    assert tally(state)["피자"] == 1 and "치킨" not in tally(state)
    assert state["voters"] == ["가"]
    assert vote_rows(conn) == 1  # 삭제된 메뉴/사용자의 투표는 DB에서도 사라진다
    assert "나" not in [u["name"] for u in store.get_users(conn)]


def test_vote_validation(conn):
    users, menus = ids(conn)
    store.delete_menus(conn, [menus["피자"]])
    for user_id, menu_ids in [(users["가"], [menus["피자"]]), (users["가"], [99999]), (99999, []),
                              ("1", []), (users["가"], "1,2"), (True, [])]:
        with pytest.raises(store.StoreError):
            store.submit_vote(conn, user_id, menu_ids)


def test_duplicate_names_rejected(conn):
    with pytest.raises(store.StoreError):
        store.add_user(conn, "가")
    with pytest.raises(store.StoreError):
        store.add_menu(conn, store.get_categories(conn)[0]["id"], " 피자 ")
    with pytest.raises(store.StoreError):
        store.add_menu(conn, 999, "새메뉴")


def test_special_characters_in_names(conn):
    cat = store.get_categories(conn)[0]["id"]
    for name in ["A&B", "#1 국밥", "50% 할인", "a:b,c", "<b>x</b>"]:
        store.add_menu(conn, cat, name)
    names = {m["name"] for m in store.get_categories(conn)[0]["menus"]}
    assert {"A&B", "#1 국밥", "50% 할인", "a:b,c", "<b>x</b>"} <= names


def test_migrates_v120_db(tmp_path, seed_dir):
    path = str(tmp_path / "old.db")
    c = sqlite3.connect(path)
    c.executescript("""
        CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, sort_order INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE menus (id INTEGER PRIMARY KEY, category_id INTEGER NOT NULL, name TEXT NOT NULL,
                            active INTEGER NOT NULL DEFAULT 1, UNIQUE (category_id, name));
        CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE votes (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, menu_id INTEGER NOT NULL, created_at REAL NOT NULL);
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO categories VALUES (1, '배달', 0);
        INSERT INTO menus (id, category_id, name, active) VALUES (1, 1, '살아있음', 1), (2, 1, '삭제됨', 0);
        INSERT INTO users (id, name, active) VALUES (1, '갑', 1), (2, '을', 0);
        INSERT INTO votes VALUES (1, 1, 1, 0), (2, 1, 2, 0);
        INSERT INTO settings VALUES ('rounds', '[]'), ('manual_reset_at', '0');
    """)
    c.commit()
    c.close()

    for _ in range(2):  # 두 번 실행해도 안전해야 한다
        store.init_db(path, str(seed_dir))
    conn = store.connect(path)
    assert [m["name"] for m in store.get_categories(conn)[0]["menus"]] == ["살아있음"]
    assert [u["name"] for u in store.get_users(conn)] == ["갑"]
    store.submit_vote(conn, 1, [1])
    store.init_db(path, str(seed_dir))
    assert vote_rows(conn) == 1  # 재시작해도 이번 회차 투표는 유지
    conn.close()


# ---------------------------------------------------------------- HTTP

def test_index_embeds_state(client):
    html = client.get("/").get_data(as_text=True)
    assert "window.__STATE__=" in html and "<!--app-state-->" not in html
    state = json.loads(html.split("window.__STATE__=", 1)[1].split("</script>", 1)[0])
    assert {"round", "rounds", "users", "categories", "me", "my_selection"} <= set(state)


def test_state_script_cannot_break_out(client):
    client.post("/api/users", json={"name": "</script><b>"})
    html = client.get("/").get_data(as_text=True)
    assert "</script><b>" not in html


def test_legacy_pages_redirect(client):
    assert client.get("/result").headers["Location"].endswith("/?tab=result")
    assert client.get("/menu-add").headers["Location"].endswith("/")


def test_get_cannot_change_state(client):
    assert client.get("/api/reset").status_code == 405
    assert client.get("/api/vote").status_code == 405


def test_vote_flow_sets_cookie_and_returns_state(client):
    state = client.get("/api/state").get_json()
    uid = state["users"][0]["id"]
    menu_id = state["categories"][0]["menus"][0]["id"]
    res = client.post("/api/vote", json={"user_id": uid, "menu_ids": [menu_id]})
    assert res.status_code == 200
    assert "uid=%d" % uid in res.headers["Set-Cookie"] and "HttpOnly" in res.headers["Set-Cookie"]
    assert res.get_json()["state"]["my_selection"] == [menu_id]

    state = client.get("/api/state").get_json()
    assert state["me"]["id"] == uid and state["my_selection"] == [menu_id]


def test_state_etag(client):
    first = client.get("/api/state")
    again = client.get("/api/state", headers={"If-None-Match": first.headers["ETag"]})
    assert again.status_code == 304


def test_me_select_and_clear(client):
    uid = client.get("/api/state").get_json()["users"][1]["id"]
    assert client.post("/api/me", json={"user_id": uid}).get_json()["state"]["me"]["id"] == uid
    assert client.post("/api/me", json={"user_id": None}).get_json()["state"]["me"] is None
    assert client.get("/api/state").get_json()["me"] is None
    assert client.post("/api/me", json={"user_id": 99999}).status_code == 404


def test_api_errors_are_json(client):
    res = client.post("/api/vote", json={"user_id": 99999, "menu_ids": []})
    assert res.status_code == 404 and res.get_json()["ok"] is False
    res = client.post("/api/vote", data="garbage", content_type="text/plain")
    assert res.status_code == 400


def test_legacy_name_cookie_migrates(client):
    client.set_cookie("name", quote("나"))
    res = client.get("/")
    assert "uid=" in res.headers.get("Set-Cookie", "")
    assert client.get("/api/state").get_json()["me"]["name"] == "나"


# ---------------------------------------------------------------- 마감 · 결승

def phase(conn, now=None):
    return store.get_state(conn, now)["phase"]


def test_close_single_winner_and_reopen(conn):
    users, menus = ids(conn)
    store.submit_vote(conn, users["가"], [menus["피자"], menus["국밥"]])
    store.submit_vote(conn, users["나"], [menus["피자"]])
    assert store.close_vote(conn) == "closed"
    p = phase(conn)
    assert p["status"] == "closed" and p["winner"]["name"] == "피자" and p["can_reopen"]
    with pytest.raises(store.StoreError):
        store.submit_vote(conn, users["다"], [menus["국밥"]])  # 마감 후 투표 불가

    store.reopen_vote(conn)
    assert phase(conn)["status"] == "open" and vote_rows(conn) == 3  # 투표 그대로


def test_tie_goes_to_runoff(conn):
    users, menus = ids(conn)
    store.submit_vote(conn, users["가"], [menus["피자"], menus["국밥"]])
    store.submit_vote(conn, users["나"], [menus["피자"], menus["국밥"], menus["치킨"]])
    assert store.close_vote(conn) == "runoff"
    p = phase(conn)
    assert p["status"] == "runoff" and p["stage"] == 1
    assert sorted(p["candidates"]) == sorted([menus["피자"], menus["국밥"]])
    assert [m["votes"] for m in p["prelim"]] == [2, 2, 1]
    assert vote_rows(conn) == 0  # 예선 투표는 집계만 남기고 삭제

    with pytest.raises(store.StoreError):
        store.submit_vote(conn, users["가"], [menus["치킨"]])  # 후보 아님
    with pytest.raises(store.StoreError):
        store.submit_vote(conn, users["가"], [menus["피자"], menus["국밥"]])  # 1인 1표
    with pytest.raises(store.StoreError):
        store.close_vote(conn)  # 결승 투표 없이 마감 불가

    store.submit_vote(conn, users["가"], [menus["피자"]])
    store.submit_vote(conn, users["나"], [menus["국밥"]])
    assert store.close_vote(conn) == "runoff" and phase(conn)["stage"] == 2  # 또 동점 → 2차 결승

    store.submit_vote(conn, users["가"], [menus["국밥"]])
    store.submit_vote(conn, users["나"], [menus["국밥"]])
    assert store.close_vote(conn) == "closed" and phase(conn)["winner"]["name"] == "국밥"

    store.reopen_vote(conn)  # 마감 취소 → 2차 결승으로 복귀
    assert phase(conn)["status"] == "runoff" and phase(conn)["stage"] == 2


def test_random_pick_only_in_runoff(conn):
    users, menus = ids(conn)
    store.submit_vote(conn, users["가"], [menus["피자"], menus["국밥"]])
    with pytest.raises(store.StoreError):
        store.close_vote(conn, pick_random=True)
    store.close_vote(conn)
    store.close_vote(conn, pick_random=True)  # 결승 투표가 없어도 후보 중에서 결정
    p = phase(conn)
    assert p["status"] == "closed" and p["decided_by"] == "random"
    assert p["winner"]["name"] in ("피자", "국밥")


def test_phase_resets_with_round(conn):
    users, menus = ids(conn)
    store.submit_vote(conn, users["가"], [menus["피자"]], now=kst(2026, 11, 20, 11, 0))
    store.close_vote(conn, now=kst(2026, 11, 20, 11, 5))
    assert phase(conn, kst(2026, 11, 20, 13, 0))["status"] == "closed"
    assert phase(conn, kst(2026, 11, 20, 14, 1))["status"] == "open"  # 다음 회차


def test_manual_reset_reopens(conn):
    users, menus = ids(conn)
    store.submit_vote(conn, users["가"], [menus["피자"]])
    store.close_vote(conn)
    store.reset_now(conn)
    assert phase(conn)["status"] == "open"
    with pytest.raises(store.StoreError):
        store.close_vote(conn)  # 투표 없음


def test_close_api(client):
    state = client.get("/api/state").get_json()
    uid, mid = state["users"][0]["id"], state["categories"][0]["menus"][0]["id"]
    client.post("/api/vote", json={"user_id": uid, "menu_ids": [mid]})
    res = client.post("/api/close", json={})
    assert res.get_json()["state"]["phase"]["status"] == "closed"
    assert client.post("/api/reopen", json={}).get_json()["state"]["phase"]["status"] == "open"


# ---------------------------------------------------------------- 카테고리 · 이동 · 이름 변경

def cat_names(conn):
    return [c["name"] for c in store.get_categories(conn)]


def test_category_crud_and_order(conn):
    new_id = store.add_category(conn, "디저트")
    assert cat_names(conn) == ["배달", "나가먹", "디저트"]
    with pytest.raises(store.StoreError):
        store.add_category(conn, "배달")

    store.move_category(conn, new_id, -1)
    assert cat_names(conn) == ["배달", "디저트", "나가먹"]
    store.move_category(conn, store.get_categories(conn)[0]["id"], -1)  # 맨 앞에서 더 앞으로: 변화 없음
    assert cat_names(conn) == ["배달", "디저트", "나가먹"]

    store.rename_category(conn, new_id, "카페")
    assert "카페" in cat_names(conn)
    with pytest.raises(store.StoreError):
        store.rename_category(conn, new_id, "나가먹")


def test_delete_category_removes_menus_and_votes(conn):
    users, menus = ids(conn)
    store.submit_vote(conn, users["가"], [menus["피자"], menus["국밥"]])
    store.delete_category(conn, store.get_categories(conn)[0]["id"])  # 배달(피자, 치킨)
    assert cat_names(conn) == ["나가먹"]
    assert set(ids(conn)[1]) == {"국밥"} and vote_rows(conn) == 1


def test_move_menus_keeps_votes(conn):
    users, menus = ids(conn)
    store.submit_vote(conn, users["가"], [menus["피자"]])
    target = store.get_categories(conn)[1]["id"]  # 나가먹
    assert store.move_menus(conn, [menus["피자"], menus["치킨"]], target) == 2
    cats = {c["name"]: [m["name"] for m in c["menus"]] for c in store.get_categories(conn)}
    assert cats == {"배달": [], "나가먹": ["국밥", "치킨", "피자"]}
    assert tally(store.get_state(conn))["피자"] == 1


def test_move_menus_name_clash(conn):
    _, menus = ids(conn)
    target = store.get_categories(conn)[1]["id"]
    store.add_menu(conn, target, "피자")
    with pytest.raises(store.StoreError) as e:
        store.move_menus(conn, [menus["피자"], menus["치킨"]], target)
    assert "피자" in e.value.message
    assert [m["name"] for m in store.get_categories(conn)[0]["menus"]] == ["치킨", "피자"]  # 아무것도 안 옮겨짐


def test_rename_menu_and_user(conn):
    users, menus = ids(conn)
    store.rename_menu(conn, menus["피자"], "화덕피자")
    with pytest.raises(store.StoreError):
        store.rename_menu(conn, menus["화덕피자" if False else "치킨"], "화덕피자")
    store.rename_user(conn, users["가"], "가나")
    with pytest.raises(store.StoreError):
        store.rename_user(conn, users["나"], "가나")
    assert "가나" in [u["name"] for u in store.get_users(conn)]


def test_category_api(client):
    res = client.post("/api/categories", json={"name": "카페"}).get_json()
    cat = next(c for c in res["state"]["categories"] if c["name"] == "카페")
    menu_id = res["state"]["categories"][0]["menus"][0]["id"]
    res = client.post("/api/menus/move", json={"ids": [menu_id], "category_id": cat["id"]}).get_json()
    assert [m["id"] for c in res["state"]["categories"] if c["name"] == "카페" for m in c["menus"]] == [menu_id]
    res = client.post("/api/categories/update", json={"id": cat["id"], "name": "디저트", "move": -1}).get_json()
    assert [c["name"] for c in res["state"]["categories"]] == ["배달", "디저트", "나가먹"]
    assert client.post("/api/categories/delete", json={"id": 99999}).status_code == 404
