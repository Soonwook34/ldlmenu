export const cn = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

const CHOSEONG = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";

/** 한글 음절을 초성으로 바꾼다. '국밥' → 'ㄱㅂ' */
function toChoseong(text: string) {
  return Array.from(text, (ch) => {
    const code = ch.charCodeAt(0) - 0xac00;
    return code >= 0 && code < 11172 ? CHOSEONG[Math.floor(code / 588)] : ch;
  }).join("");
}

const normalize = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** 공백 무시, 대소문자 무시, 초성 검색('ㄱㅂ' → 국밥) 지원 */
export function matches(name: string, query: string) {
  const q = normalize(query);
  if (!q) return true;
  const n = normalize(name);
  if (n.includes(q)) return true;
  return /^[ㄱ-ㅎ]+$/.test(q) && toChoseong(n).includes(q);
}

export function remainingLabel(seconds: number) {
  if (seconds <= 60) return "곧 초기화";
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}시간 ${minutes % 60}분 남음` : `${minutes}분 남음`;
}

export const sameSet = (a: Iterable<number>, b: Iterable<number>) => {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
};
