let resultBtn = document.getElementById("result-btn");
let submitBtn = document.getElementById("submit-btn");
let submitBtnBottom = document.getElementById("submit-btn-bottom");
let deleteBtn = document.getElementById("delete-btn");
let nameInput = document.getElementById("name");


let setLocalName = (name) => {
    let date = new Date();
    date.setTime(date.getTime() + (1000 * 24 * 60 * 60 * 1000));
    cookies = `name=${name};path=/;expires=${date.toUTCString()};`;
    document.cookie = cookies;
    
};

let getLocalName = () => {
    let cookies = document.cookie.split(";");
    let targetName = null;
    cookies.forEach(e => {
        let [cookieName, cookieValue] = e.split("=");
        if (cookieName === "name") {
            targetName = cookieValue;
        }
    });
    return targetName;
};

let selectName = (name) => {
    let selected = false;
    Array.from(nameInput.options).forEach(e => {
        if (e.value === name) {
            e.selected = true;
            selected = true;
        }
        else {
            e.selected = false;
        }
    });
    if (selected === false) {
        nameInput.options[0].selected = true;
    }
};

let userName = getLocalName();
if (userName !== null) {
    selectName(getLocalName());
};

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
            setLocalName(nameInput.value)
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

