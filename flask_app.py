from flask import Flask
from flask import (render_template, request, redirect)

from menu_board import MenuBoard


app = Flask(__name__)
# 메뉴와 투표판
menuboard = MenuBoard()
script = "버전: 1.0.2 by 순욱"

@app.route("/")
def home():
    clear = request.args.get("clear")
    if clear:
        menuboard.clear_board()
        return redirect(request.path)
    return render_template("home.html", menu=menuboard.get_menu(), script=script)


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
                           script=script)


if __name__ == '__main__':
    app.run(host="0.0.0.0", port=8080)
