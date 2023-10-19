let resetBtn = document.getElementById("reset-btn");

resetBtn.addEventListener("click", (e) => {
    if(!confirm("복구할 수 없습니다. 정말로 초기화하시겠습니까?")) {
        return false;
    }
    else {
        e.preventDefault();
        window.location = `/?clear=1`;
    }
});