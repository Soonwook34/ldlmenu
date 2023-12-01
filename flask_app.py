from random import shuffle

from flask import Flask
from flask import (render_template, request, redirect)

from menu_board import MenuBoard


app = Flask(__name__)
# 메뉴와 투표판
menuboard = MenuBoard()
script = "버전: 1.1.0 by 순욱"
github = "https://github.com/Soonwook34/ldlmenu"

@app.route("/")
def home():
    clear = request.args.get("clear")
    if clear:
        menuboard.clear_board()
        return redirect(request.path)
    menu = menuboard.get_menu()
    for m in menu:
        shuffle(menu[m])
    return render_template("home.html", menu=menu, user=menuboard.get_user(), script=script, github=github)


@app.route("/result")
def result():
    name = request.args.get("name")
    if name != None:
        votes = request.args.get("vote")
        menuboard.update_board(name, votes)
        return redirect(request.path)
    return render_template("result.html", 
                           board=menuboard.get_board(), 
                           top=menuboard.get_top(), 
                           names=menuboard.get_names(),
                           max_vote=menuboard.get_max_vote(), 
                           script=script,
                           github=github)


@app.route("/menu-add")
def menu_add():
    return render_template("menu_add.html", menu=menuboard.get_menu(), script=script, github=github)
    

@app.route("/menu-delete")
def menu_delete():
    return render_template("menu_delete.html", menu=menuboard.get_menu(), script=script, github=github)


@app.route("/user-add")
def user_add():
    return render_template("user_add.html", user=menuboard.get_user(), script=script, github=github)
    

@app.route("/user-delete")
def user_delete():
    return render_template("user_delete.html", user=menuboard.get_user(), script=script, github=github)


@app.route("/add")
def add():
    target_type = request.args.get("type")
    target = request.args.get("target")
    # 메뉴 추가 및 초기화
    if target_type == "menu":
        menuboard.add_menu(target)
    # 유저 추가 및 초기화
    else:
        menuboard.add_user(target)
    return redirect("/")


@app.route("/delete")
def delete():
    target_type = request.args.get("type")
    targets = request.args.get("target")
    # 메뉴 삭제 및 초기화
    if target_type == "menu":
        menuboard.delete_menu(targets)
    # 유저 삭제 및 초기화
    else:
        menuboard.delete_user(targets)
    return redirect("/")
    

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=8080)
