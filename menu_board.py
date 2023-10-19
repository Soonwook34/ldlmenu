import json

def load_menu():
    with open("menu.json", "r", encoding="utf8") as menu_data:
        menu = json.load(menu_data)
    
    return menu


def clear_board(menu):
    board = {}
    for category in menu:
        board[category] = {}
        for food in menu[category]:
            board[category][food] = {"vote": 0, "people": []}
    
    return board

