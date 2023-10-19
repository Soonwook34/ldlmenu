import json
from copy import deepcopy

from menu import menu_dict


class MenuBoard():
    def __init__(self):
        self.clear_board()
    
    def clear_board(self):
        self.menu = self._load_menu()
        self.board = self._load_board()
        self.names = []
        self.max_vote = 1

    def get_menu(self):
        return self.menu
    
    def get_board(self):
        return self.board
    
    def get_names(self):
        return ",".join(self.names)

    def get_max_vote(self):
        return self.max_vote

    def update_board(self, name, votes):
        if name not in self.names:
            self.names.append(name)
            for vote in votes.split(","):
                category, food = vote.split(":")
                self.board[category][food]["vote"] += 1
                self.board[category][food]["people"].append(name)
                self.max_vote = max(self.max_vote, self.board[category][food]["vote"])
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
        menu = deepcopy(menu_dict)
        return menu

    def _load_board(self):
        board = {}
        for category in self.menu:
            board[category] = {}
            for food in self.menu[category]:
                board[category][food] = {"vote": 0, "people": []}
        return board

