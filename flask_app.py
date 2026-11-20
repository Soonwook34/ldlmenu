import os
import random
from urllib.parse import unquote

from flask import Flask, g, jsonify, render_template, request

import store
from store import StoreError

VERSION = "버전: 1.2.0 by 순욱"
GITHUB = "https://github.com/Soonwook34/ldlmenu"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
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

    def current_user():
        """이 기기에 기억된 사용자. uid 쿠키 → (구버전) name 쿠키 순으로 찾는다."""
        uid = request.cookies.get(UID_COOKIE)
        if uid and uid.isdigit():
            user = store.get_user(db(), int(uid))
            if user:
                return user
        legacy = request.cookies.get("name")
        if legacy:
            return store.find_user_by_name(db(), unquote(legacy))
        return None

    def remember(resp, user_id):
        resp.set_cookie(UID_COOKIE, str(user_id), max_age=UID_MAX_AGE, samesite="Lax", httponly=True)
        return resp

    def body():
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            raise StoreError("요청 형식이 올바르지 않습니다.")
        return data

    def page(template, **ctx):
        return render_template(template, script=VERSION, github=GITHUB, **ctx)

    # ------------------------------------------------------------ 페이지

    @app.route("/")
    def home():
        state = store.get_state(db())
        for c in state["categories"]:
            random.shuffle(c["menus"])
        me = current_user()
        resp = app.make_response(page("home.html", state=state, me=me))
        if me and request.cookies.get(UID_COOKIE) != str(me["id"]):
            remember(resp, me["id"])  # 구버전 쿠키 → uid 쿠키로 이전
        return resp

    @app.route("/result")
    def result():
        return page("result.html", state=store.get_state(db()))

    @app.route("/menu-add")
    def menu_add():
        return page("menu_add.html", categories=store.get_categories(db()))

    @app.route("/menu-delete")
    def menu_delete():
        return page("menu_delete.html", categories=store.get_categories(db()))

    @app.route("/user-add")
    def user_add():
        return page("user_add.html", users=store.get_users(db()))

    @app.route("/user-delete")
    def user_delete():
        return page("user_delete.html", users=store.get_users(db()))

    @app.route("/settings")
    def settings():
        return page("settings.html", rounds=store.get_rounds(db()), round=store.round_info(db()))

    # ------------------------------------------------------------ API

    @app.route("/api/state")
    def api_state():
        state = store.get_state(db())
        me = current_user()
        state["me"] = me
        state["my_selection"] = state["selections"].get(me["id"], []) if me else []
        del state["selections"]
        return jsonify(state)

    @app.route("/api/vote", methods=["POST"])
    def api_vote():
        data = body()
        user_id = data.get("user_id")
        store.submit_vote(db(), user_id, data.get("menu_ids", []))
        return remember(jsonify(ok=True), user_id)

    @app.route("/api/reset", methods=["POST"])
    def api_reset():
        store.reset_now(db())
        return jsonify(ok=True)

    @app.route("/api/menus", methods=["POST"])
    def api_menu_add():
        data = body()
        name = store.add_menu(db(), data.get("category_id"), data.get("name"))
        return jsonify(ok=True, name=name)

    @app.route("/api/menus/delete", methods=["POST"])
    def api_menu_delete():
        store.delete_menus(db(), body().get("ids"))
        return jsonify(ok=True)

    @app.route("/api/users", methods=["POST"])
    def api_user_add():
        name = store.add_user(db(), body().get("name"))
        return jsonify(ok=True, name=name)

    @app.route("/api/users/delete", methods=["POST"])
    def api_user_delete():
        store.delete_users(db(), body().get("ids"))
        return jsonify(ok=True)

    @app.route("/api/settings/rounds", methods=["POST"])
    def api_rounds():
        rounds = store.set_rounds(db(), body().get("rounds"))
        return jsonify(ok=True, rounds=rounds, round=store.round_info(db()))

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
