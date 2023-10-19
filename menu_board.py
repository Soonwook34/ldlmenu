import json


class MenuBoard():
    def __init__(self):
        self.clear_board()
    
    def clear_board(self):
        self.menu = self._load_menu()
        self.board = self._load_board()
        self.names = []

    def get_menu(self):
        return self.menu
    
    def get_board(self):
        return self.board
    
    def get_total(self):
        total = len(self.names) if len(self.names) > 0 else 1
        return total

    def update_board(self, name, votes):
        if name not in self.names:
            self.names.append(name)
            for vote in votes.split(","):
                category, food = vote.split(":")
                self.board[category][food]["vote"] += 1
                self.board[category][food]["people"].append(name)
        return
    
    def get_top(self):
        top_list = []
        for category in self.board:
            for food in self.board[category]:
                vote = self.board[category][food]["vote"]
                people = self.board[category][food]["people"]
                top_list.append((food, vote, ",".join(people)))
        top_list.sort(key=lambda x: x[1], reverse=True)
        return top_list[:3]
        
    
    def _load_menu(self):
        with open("menu.json", "r", encoding="utf8") as menu_data:
            menu = json.load(menu_data)
        return menu

    def _load_board(self):
        board = {}
        for category in self.menu:
            board[category] = {}
            for food in self.menu[category]:
                board[category][food] = {"vote": 0, "people": []}
        return board

