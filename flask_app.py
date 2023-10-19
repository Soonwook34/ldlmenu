from flask import Flask
from flask import (render_template)

from menu_board import (load_menu, clear_board)



app = Flask("[SKKU-LDL] 점심저녁 메뉴 투표판")

@app.route('/')
def home():

    return render_template("home.html", menu=menu)


# 메뉴와 투표판 로드
menu = load_menu()
category = list(menu.keys())
board = clear_board(menu)

app.run(host="localhost", port=8080)
