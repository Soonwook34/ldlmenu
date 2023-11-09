let resultBtn = document.getElementById("result-btn");
let submitBtn = document.getElementById("submit-btn");
let submitBtnBottom = document.getElementById("submit-btn-bottom");
let deleteBtn = document.getElementById("delete-btn");
let nameInput = document.getElementById("name");

handleSubmit = (e) => {
    e.preventDefault();

    let checkList = [];
    let menu = document.querySelectorAll("input:checked");
    menu.forEach((food) => {
        checkList.push(food.id)
    })
    if (checkList.length > 0 & nameInput.value.length > 0) {
        if (!confirm(`'${nameInput.value}'님이 맞습니까?\n이미 투표를 진행했을 경우 현재 투표로 결과가 업데이트됩니다.`)) {
            return false;
        }
        else {
            window.location = `/result?name=${nameInput.value}&vote=${checkList}`;
        }
    }
};

submitBtn.addEventListener("click", (e) => {
    handleSubmit(e);
});

submitBtnBottom.addEventListener("click", (e) => {
    handleSubmit(e);
});

resultBtn.addEventListener("click", (e) => {
    e.preventDefault();
    window.location = "/result";
});

deleteBtn.addEventListener("click", (e) => {
    e.preventDefault();
    
    if (!confirm(`투표 주워담이 '${nameInput.value}'님이 맞습니까?\n투표를 삭제합니다.`)) {
        return false;
    }
    else {
        let checkList = [];
        window.location = `/result?name=${nameInput.value}&vote=${checkList}`;
    }
});