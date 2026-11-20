// 상태 변경 요청은 모두 JSON POST로 보낸다.
async function api(url, body) {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || "서버 오류가 발생했습니다.");
    return data;
}

function checkedIds(scope) {
    return Array.from((scope || document).querySelectorAll("input[data-id]:checked"))
        .map((e) => Number(e.dataset.id));
}

function onClick(id, handler) {
    document.getElementById(id).addEventListener("click", async (e) => {
        e.preventDefault();
        try { await handler(e); } catch (err) { alert(err.message); }
    });
}
