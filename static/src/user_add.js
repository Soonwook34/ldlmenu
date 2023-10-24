let submitBtn = document.getElementById("add-btn");
let homeBtn = document.getElementById("home-btn");
let nameInput = document.getElementById("name");

submitBtn.addEventListener("click", (e) => {
    userName = nameInput.value
    userName = userName.replaceAll(" ", "").replaceAll(",", "")
    if (userName.length > 0) {
        if(!confirm(`현재 투표가 초기화됩니다.\n사용자 '${userName}'을/를 추가할까요?`)) {
            return false;
        }
        else {
            e.preventDefault();
            window.location = `/add?type=user&target=${userName}`;
        }
    }
    else {
        alert("올바른 사용자 이름을 입력해주세요.")
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

