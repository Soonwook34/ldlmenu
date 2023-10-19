from socket import gethostname
from flask import Flask
from flask import (render_template, request, redirect)

from menu_board import MenuBoard


app = Flask("[SKKU-LDL] 메뉴 투표판")

@app.route("/")
def home():
    clear = request.args.get("clear")
    if clear:
        menuboard.clear_board()
        return redirect(request.path)
    return render_template("home.html", menu=menuboard.get_menu())


@app.route("/result")
def result():
    name = request.args.get("name")
    if name != None:
        votes = request.args.get("vote")
        menuboard.update_board(name, votes)
    print(menuboard.get_total())
    return render_template("result.html", board=menuboard.get_board(), top=menuboard.get_top(), total=menuboard.get_total())


if __name__ == '__main__':
    # 메뉴와 투표판
    menuboard = MenuBoard()
    if 'liveconsole' not in gethostname():
        app.run(host="localhost", port=8080)
