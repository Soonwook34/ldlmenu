let resetBtn = document.getElementById("reset-btn");
let homeBtn = document.getElementById("home-btn");

resetBtn.addEventListener("click", (e) => {
    if(!confirm("복구할 수 없습니다. 정말로 초기화하시겠습니까?")) {
        return false;
    }
    else {
        e.preventDefault();
        window.location = "/?clear=1";
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