import type { AppState } from "./types";

export async function fetchState(): Promise<AppState> {
  const res = await fetch("/api/state", { cache: "no-cache" });
  if (!res.ok) throw new Error("상태를 불러오지 못했어요.");
  return res.json();
}

/** 변경 요청. 서버가 최신 상태를 함께 돌려준다. */
export async function post(path: string, body: unknown = {}): Promise<AppState> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("네트워크 연결을 확인해 주세요.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || "서버 오류가 발생했어요.");
  return data.state;
}
