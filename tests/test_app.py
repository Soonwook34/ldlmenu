import json
import os
import sys
from datetime import datetime
from urllib.parse import quote

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("LDLMENU_DB", ":memory:")  # import 시 생성되는 전역 app이 실제 DB를 건드리지 않도록

import store  # noqa: E402
from flask_app import create_app  # noqa: E402


def kst(y, mo, d, h, mi):
    return datetime(y, mo, d, h, mi, tzinfo=store.KST).timestamp()


@pytest.fixture
def seed_dir(tmp_path):
    (tmp_path / "menu.json").write_text(json.dumps({"배달": ["피자", "치킨"], "나가먹": ["국밥"]}, ensure_ascii=False))
    (tmp_path / "user.json").write_text(json.dumps(["가", "나", "다"], ensure_ascii=False))
    return tmp_path


@pytest.fixture
def conn(tmp_path, seed_dir):
    path = str(tmp_path / "t.db")
    store.init_db(path, str(seed_dir))
    c = store.connect(path)
    yield c
    c.close()


@pytest.fixture
def client(tmp_path, seed_dir, monkeypatch):
    monkeypatch.setattr("flask_app.BASE_DIR", str(seed_dir))
    app = create_app(str(tmp_path / "app.db"))
    return app.test_client()


def ids(conn):
    users = {u["name"]: u["id"] for u in store.get_users(conn)}
    menus = {m["name"]: m["id"] for c in store.get_categories(conn) for m in c["menus"]}
    return users, menus


def tally(state):
    return {m["name"]: m["votes"] for c in state["categories"] for m in c["menus"]}


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


def test_votes_expire_at_reset(conn):
    users, menus = ids(conn)
    store.submit_vote(conn, users["가"], [menus["피자"]], now=kst(2026, 11, 20, 11, 0))
    assert tally(store.get_state(conn, kst(2026, 11, 20, 13, 59)))["피자"] == 1
    assert tally(store.get_state(conn, kst(2026, 11, 20, 14, 0)))["피자"] == 0


def test_no_rounds_means_no_auto_reset(conn):
    users, menus = ids(conn)
    store.set_rounds(conn, [])
    store.submit_vote(conn, users["가"], [menus["피자"]], now=kst(2026, 11, 20, 11, 0))
    state = store.get_state(conn, kst(2026, 12, 25, 11, 0))
    assert tally(state)["피자"] == 1 and state["round"]["next_reset"] is None


def test_manual_reset(conn):
    users, menus = ids(conn)
    store.submit_vote(conn, users["가"], [menus["피자"]], now=kst(2026, 11, 20, 11, 0))
    store.reset_now(conn, now=kst(2026, 11, 20, 11, 30))
    assert tally(store.get_state(conn, kst(2026, 11, 20, 12, 0)))["피자"] == 0


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
    assert state["voters"] == ["가"]

    store.submit_vote(conn, users["가"], [], now=t + 180)
    state = store.get_state(conn, t + 240)
    assert state["voters"] == [] and state["ranking"] == []


def test_ranking_ties_not_truncated():
    menus = [{"name": n, "votes": v} for n, v in [("a", 2), ("b", 2), ("c", 1), ("d", 1), ("e", 1), ("f", 0)]]
    assert [(m["name"], m["rank"]) for m in store.ranking(menus)] == [("a", 1), ("b", 1), ("c", 3), ("d", 3), ("e", 3)]
    menus = [{"name": n, "votes": v} for n, v in [("a", 3), ("b", 2), ("c", 2), ("d", 1)]]
    assert [m["rank"] for m in store.ranking(menus)] == [1, 2, 2]
    assert store.ranking([{"name": "a", "votes": 0}]) == []


def test_editing_menus_and_users_keeps_votes(conn):
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

    # 다시 추가하면 복구되고 이번 회차 표도 돌아온다
    store.add_menu(conn, store.get_categories(conn)[0]["id"], "치킨")
    assert tally(store.get_state(conn, t + 60))["치킨"] == 1


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
    for name in ["A&B", "#1 국밥", "50% 할인", "닭/곱도리탕", "a:b,c"]:
        store.add_menu(conn, cat, name)
    names = {m["name"] for m in store.get_categories(conn)[0]["menus"]}
    assert {"A&B", "#1 국밥", "50% 할인", "a:b,c"} <= names


# ---------------------------------------------------------------- HTTP

def test_pages_render(client):
    for path in ["/", "/result", "/menu-add", "/menu-delete", "/user-add", "/user-delete", "/settings"]:
        assert client.get(path).status_code == 200, path
    # 메뉴 그리드가 실제로 그려지는지 (시드 메뉴 3개)
    for path in ["/", "/menu-add", "/menu-delete"]:
        assert client.get(path).get_data(as_text=True).count("data-id=") == 3, path


def test_get_cannot_change_state(client):
    assert client.get("/?clear=1").status_code == 200
    assert client.get("/api/reset").status_code == 405
    assert client.get("/add?type=user&target=x").status_code == 404


def test_vote_flow_sets_cookie(client):
    state = client.get("/api/state").get_json()
    uid = state["users"][0]["id"]
    menu_id = state["categories"][0]["menus"][0]["id"]
    res = client.post("/api/vote", json={"user_id": uid, "menu_ids": [menu_id]})
    assert res.status_code == 200
    assert "uid=%d" % uid in res.headers["Set-Cookie"] and "HttpOnly" in res.headers["Set-Cookie"]

    state = client.get("/api/state").get_json()
    assert state["me"]["id"] == uid and state["my_selection"] == [menu_id]
    assert 'selected>' in client.get("/").get_data(as_text=True)


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
