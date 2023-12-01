import os
import json
from copy import deepcopy


class MenuBoard():
    def __init__(self):
        self.my_dir = os.path.dirname(__file__)
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
        ordered_board = {}
        for category in self.board:
            ordered_board[category] = dict(sorted(self.board[category].items(), key=lambda x: x[1]["vote"], reverse=True))
        return ordered_board
    
    def get_names(self):
        return self.names

    def get_max_vote(self):
        return self.max_vote

    def update_board(self, name, votes):
        if len(votes) == 0:
            if name in self.names:
                self.delete_vote(name)
                self.names.remove(name)
        else:
            if name in self.names:
                self.delete_vote(name)
            else:
                self.names.append(name)
            vote_list = votes.split(",")
            for vote in vote_list:
                category, food = vote.split(":")
                self.board[category][food]["vote"] += 1
                self.board[category][food]["people"].append(name)
                self.max_vote = max(self.max_vote, self.board[category][food]["vote"])
        return
    
    def delete_vote(self, name):
        self.max_vote -= 1
        for category in self.board:
            for food in self.board[category]:
                if name in self.board[category][food]["people"]:
                    self.board[category][food]["people"].remove(name)
                    self.board[category][food]["vote"] -= 1
                self.max_vote = max(self.max_vote, self.board[category][food]["vote"])
        self.max_vote = max(self.max_vote, 1)
    
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
        N_TOP = 3
        top_list = []
        for category in self.board:
            for food in self.board[category]:
                vote = self.board[category][food]["vote"]
                people = self.board[category][food]["people"]
                top_list.append((food, vote, ",".join(people)))
        top_list.sort(key=lambda x: x[1], reverse=True)
        top_list = top_list[:N_TOP]
        rank = 1
        prev_vote = top_list[0][1]
        for idx, (food, vote, people) in enumerate(top_list):
            if vote < prev_vote:
                rank += 1
            top_list[idx] = (rank, food, vote, people)
            prev_vote = vote
        return top_list
    
    def _load_menu(self):
        with open(os.path.join(self.my_dir, "menu.json"), "r", encoding="utf8") as menu_file:
            menu = json.load(menu_file)
        for m in menu:
            menu[m] = sorted(menu[m])
        return menu
    
    def _load_user(self):
        with open(os.path.join(self.my_dir, "user.json"), "r", encoding="utf8") as user_file:
            user = json.load(user_file)
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
        for m in self.menu:
            self.menu[m] = sorted(self.menu[m])
        with open(os.path.join(self.my_dir, "menu.json"), "w", encoding="utf8") as output_file:
            json.dump(self.menu, output_file, indent=4, ensure_ascii=False)
        self.clear_board()
        return
    
    def _save_user(self):
        self.user = sorted(self.user)
        with open(os.path.join(self.my_dir, "user.json"), "w", encoding="utf8") as output_file:
            json.dump(self.user, output_file, indent=4, ensure_ascii=False)
        self.clear_board()
        return

