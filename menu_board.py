import json
from copy import deepcopy

import menu as mm
import user as uu


class MenuBoard():
    def __init__(self):
        self.clear_board()
    
    def clear_board(self):
        self.menu = self._load_menu()
        self.user = self._load_user()
        self.board = self._load_board()
        self.names = []
        self.max_vote = 1

    def get_menu(self):
        return self.menu
    
    def get_user(self):
        return self.user
    
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
    
    def add_menu(self, target):
        category, menu = target.split(":")
        if menu not in self.menu[category]:
            self.menu[category].append(menu)
        self._save_menu()
        return
    
    def add_user(self, target):
        if target not in self.user:
            self.user.append(target)
        self._save_user()
        return

    def delete_menu(self, targets):
        target_list = targets.split(",")
        for category in self.menu:
            new_food_list = [food for food in self.menu[category] if f"{category}:{food}" not in target_list]
            self.menu[category] = deepcopy(new_food_list)
        self._save_menu()
        return
    
    def delete_user(self, targets):
        target_list = targets.split(",")
        new_user_list = [name for name in self.user if name not in target_list]
        self.user = deepcopy(new_user_list)
        self._save_user()
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
        menu = deepcopy(mm.menu_dict)
        for m in menu:
            menu[m] = sorted(menu[m])
        return menu
    
    def _load_user(self):
        user = deepcopy(uu.user_list)
        user = sorted(user)
        return user

    def _load_board(self):
        board = {}
        for category in self.menu:
            board[category] = {}
            for food in self.menu[category]:
                board[category][food] = {"vote": 0, "people": []}
        return board

    def _save_menu(self):
        mm.menu_dict = deepcopy(self.menu)
        with open("menu.json", "w", encoding="utf8") as output_file:
            json.dump(mm.menu_dict, output_file, indent=4, ensure_ascii=False)
        self.clear_board()
        return
    
    def _save_user(self):
        uu.user_list = deepcopy(self.user)
        with open("user.json", "w", encoding="utf8") as output_file:
            json.dump(uu.user_list, output_file, indent=4, ensure_ascii=False)
        self.clear_board()
        return

