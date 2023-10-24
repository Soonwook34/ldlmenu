let resultBtn = document.getElementById("result-btn");
let submitBtn = document.getElementById("submit-btn");
let nameInput = document.getElementById("name");

submitBtn.addEventListener("click", (e) => {
    let checkList = [];
    let menu = document.querySelectorAll("input:checked");
    menu.forEach((food) => {
        checkList.push(food.id)
    })
    
    if (checkList.length > 0 & nameInput.value.length > 0) {
        e.preventDefault();
        window.location = `/result?name=${nameInput.value}&vote=${checkList}`;
    }
});

resultBtn.addEventListener("click", (e) => {
    e.preventDefault();
    window.location = "/result";
});