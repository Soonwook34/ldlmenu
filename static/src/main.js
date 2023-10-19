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