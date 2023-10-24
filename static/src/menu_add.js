let submitBtn = document.getElementById("add-btn");
let homeBtn = document.getElementById("home-btn");
let categoryInput = document.getElementById("category");
let menuInput = document.getElementById("menu");

submitBtn.addEventListener("click", (e) => {
    category = categoryInput.value
    menu = menuInput.value
    menu = menu.replaceAll(" ", "").replaceAll(",", "").replaceAll(":", "")
    if (menu.length > 0) {
        if(!confirm(`현재 투표가 초기화됩니다.\n${category}에 '${menu}'을/를 추가할까요?`)) {
            return false;
        }
        else {
            e.preventDefault();
            window.location = `/add?type=menu&target=${category}:${menu}`;
        }
    }
    else {
        alert("올바른 메뉴 이름을 입력해주세요.")
    }
});


homeBtn.addEventListener("click", (e) => {
    if(!confirm("처음 화면으로 돌아갈까요?")) {
        return false;
    }
    else {
        e.preventDefault();
        window.location = "/";
    }
});

