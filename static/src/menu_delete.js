let submitBtn = document.getElementById("delete-btn");
let homeBtn = document.getElementById("home-btn");

submitBtn.addEventListener("click", (e) => {
    let checkList = [];
    let menu = document.querySelectorAll("input:checked");
    menu.forEach((food) => {
        checkList.push(food.id)
    })
    if (checkList.length > 0) {
        if(!confirm("현재 투표가 초기화됩니다.\n정말 삭제할까요?")) {
            return false;
        }
        else {
            e.preventDefault();
            window.location = `/delete?type=menu&target=${checkList}`;
        }
    }
    else {
        alert("삭제할 메뉴를 한 개 이상 선택해 주세요")
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

