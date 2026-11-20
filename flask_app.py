import json
import os
from urllib.parse import unquote

from flask import Flask, g, jsonify, redirect, request

import store
from store import StoreError

VERSION = "2.0.1"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
APP_INDEX = os.path.join(BASE_DIR, "static", "app", "index.html")  # frontend/ 빌드 결과
STATE_PLACEHOLDER = "<!--app-state-->"
UID_COOKIE = "uid"
UID_MAX_AGE = 60 * 60 * 24 * 400  # 브라우저 상한(약 400일)


def create_app(db_path=None):
    app = Flask(__name__)
    app.config["DB_PATH"] = db_path or os.environ.get("LDLMENU_DB") or os.path.join(BASE_DIR, "ldlmenu.db")
    store.init_db(app.config["DB_PATH"], BASE_DIR)

    def db():
        if "db" not in g:
            g.db = store.connect(app.config["DB_PATH"])
        return g.db

    @app.teardown_appcontext
    def close_db(_exc):
        conn = g.pop("db", None)
        if conn is not None:
            conn.close()

    @app.errorhandler(StoreError)
    def store_error(err):
        return jsonify(ok=False, error=err.message), err.status

    # ------------------------------------------------------------ 사용자 식별

    def current_user():
        """이 기기에 기억된 사용자. uid 쿠키 → (v1.1 이하) name 쿠키 순으로 찾는다."""
        uid = request.cookies.get(UID_COOKIE)
        if uid and uid.isdigit():
            user = store.get_user(db(), int(uid))
            if user:
                return user
        legacy = request.cookies.get("name")
        if legacy:
            return store.find_user_by_name(db(), unquote(legacy))
        return None

    def sync_cookie(resp, me):
        if me and request.cookies.get(UID_COOKIE) != str(me["id"]):
            resp.set_cookie(UID_COOKIE, str(me["id"]), max_age=UID_MAX_AGE, samesite="Lax", httponly=True)
        return resp

    def client_state(me):
        state = store.get_state(db())
        selections = state.pop("selections")
        state["me"] = me
        state["my_selection"] = selections.get(me["id"], []) if me else []
        state["version"] = VERSION
        return state

    def respond(me=None):
        """변경 요청의 응답: 최신 상태를 함께 돌려줘 추가 조회가 필요 없게 한다."""
        me = me if me is not None else current_user()
        return sync_cookie(jsonify(ok=True, state=client_state(me)), me)

    def body():
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            raise StoreError("요청 형식이 올바르지 않습니다.")
        return data

    # ------------------------------------------------------------ 페이지

    @app.route("/")
    def index():
        try:
            with open(APP_INDEX, encoding="utf8") as f:
                html = f.read()
        except FileNotFoundError:
            return "프론트엔드 빌드가 없습니다. frontend/에서 npm run build를 실행하세요.", 500
        me = current_user()
        payload = json.dumps(client_state(me), ensure_ascii=False).replace("<", "\\u003c")
        html = html.replace(STATE_PLACEHOLDER, f"<script>window.__STATE__={payload}</script>", 1)
        resp = app.make_response(html)
        resp.headers["Cache-Control"] = "no-cache"
        return sync_cookie(resp, me)

    @app.route("/result")
    @app.route("/settings")
    @app.route("/menu-add")
    @app.route("/menu-delete")
    @app.route("/user-add")
    @app.route("/user-delete")
    def legacy_pages():
        return redirect("/?tab=result" if request.path == "/result" else "/")

    # ------------------------------------------------------------ API

    @app.route("/api/state")
    def api_state():
        me = current_user()
        resp = jsonify(client_state(me))
        resp.headers["Cache-Control"] = "no-cache"
        resp.add_etag()
        return sync_cookie(resp.make_conditional(request), me)

    @app.route("/api/me", methods=["POST"])
    def api_me():
        user_id = body().get("user_id")
        if user_id is None:  # 이름 선택 해제
            resp = jsonify(ok=True, state=client_state(None))
            resp.delete_cookie(UID_COOKIE)
            resp.delete_cookie("name")
            return resp
        me = store.get_user(db(), user_id) if isinstance(user_id, int) else None
        if me is None:
            raise StoreError("사용자를 찾을 수 없습니다.", 404)
        return respond(me)

    @app.route("/api/vote", methods=["POST"])
    def api_vote():
        data = body()
        user_id = data.get("user_id")
        store.submit_vote(db(), user_id, data.get("menu_ids", []))
        return respond(store.get_user(db(), user_id))

    @app.route("/api/reset", methods=["POST"])
    def api_reset():
        store.reset_now(db())
        return respond()

    @app.route("/api/close", methods=["POST"])
    def api_close():
        store.close_vote(db(), pick_random=body().get("random") is True)
        return respond()

    @app.route("/api/reopen", methods=["POST"])
    def api_reopen():
        store.reopen_vote(db())
        return respond()

    @app.route("/api/menus", methods=["POST"])
    def api_menu_add():
        data = body()
        store.add_menu(db(), data.get("category_id"), data.get("name"))
        return respond()

    @app.route("/api/menus/delete", methods=["POST"])
    def api_menu_delete():
        store.delete_menus(db(), body().get("ids"))
        return respond()

    @app.route("/api/categories", methods=["POST"])
    def api_category_add():
        store.add_category(db(), body().get("name"))
        return respond()

    @app.route("/api/categories/update", methods=["POST"])
    def api_category_update():
        data = body()
        if "name" in data:
            store.rename_category(db(), data.get("id"), data["name"])
        if "move" in data:
            store.move_category(db(), data.get("id"), data["move"])
        return respond()

    @app.route("/api/categories/delete", methods=["POST"])
    def api_category_delete():
        store.delete_category(db(), body().get("id"))
        return respond()

    @app.route("/api/menus/update", methods=["POST"])
    def api_menu_rename():
        data = body()
        store.rename_menu(db(), data.get("id"), data.get("name"))
        return respond()

    @app.route("/api/menus/move", methods=["POST"])
    def api_menu_move():
        data = body()
        store.move_menus(db(), data.get("ids"), data.get("category_id"))
        return respond()

    @app.route("/api/users/update", methods=["POST"])
    def api_user_rename():
        data = body()
        store.rename_user(db(), data.get("id"), data.get("name"))
        return respond()

    @app.route("/api/users", methods=["POST"])
    def api_user_add():
        store.add_user(db(), body().get("name"))
        return respond()

    @app.route("/api/users/delete", methods=["POST"])
    def api_user_delete():
        store.delete_users(db(), body().get("ids"))
        return respond()

    @app.route("/api/settings/rounds", methods=["POST"])
    def api_rounds():
        store.set_rounds(db(), body().get("rounds"))
        return respond()

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
