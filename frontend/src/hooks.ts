import { useEffect, useRef, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";
export type MenuOrder = "random" | "name";
export type Accent = "orange" | "blue" | "green" | "violet" | "pink";
export const ACCENTS: { value: Accent; label: string }[] = [
  { value: "green", label: "초록" },
  { value: "orange", label: "주황" },
  { value: "blue", label: "파랑" },
  { value: "violet", label: "보라" },
  { value: "pink", label: "분홍" },
];

/** 강조색: 기기에 저장하고 <html data-accent>로 적용 (첫 페인트는 index.html의 인라인 스크립트가 맡는다) */
export function useAccent() {
  const [accent, setAccent] = usePref<Accent>("accent", "green");
  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);
  return [accent, setAccent] as const;
}

/** 지금 강조색의 실제 색 값 (꽃가루처럼 CSS 변수를 못 쓰는 곳용) */
export const brandColor = (name = "--brand-500") =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#10b981";

/** 이 기기에만 저장되는 개인 설정 (localStorage) */
export function usePref<T extends string>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T) || fallback;
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* 저장 불가 환경에서는 이번 접속에만 적용 */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

/** 테마 선택은 기기(localStorage)에 저장되어 다시 접속해도 유지된다. */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    try {
      return (localStorage.getItem("theme") as ThemeMode) || "system";
    } catch {
      return "system";
    }
  });
  const [systemDark, setSystemDark] = useState(() => darkQuery().matches);
  const dark = mode === "dark" || (mode === "system" && systemDark);

  useEffect(() => {
    const mq = darkQuery();
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#09090b" : "#fafafa");
    try {
      localStorage.setItem("theme", mode);
    } catch {
      /* 사생활 보호 모드 등에서는 저장하지 않는다 */
    }
  }, [mode, dark]);

  return { mode, setMode, dark };
}

/**
 * 무료 티어(웹 워커 1개)를 고려한 적응형 폴링.
 * - 변화가 있으면 FAST 간격, 변화가 없을수록 SLOW까지 점점 늘린다.
 * - 화면이 안 보이면 멈추고, 다시 보이면 즉시 1회 + 빠른 간격으로 복귀.
 * - IDLE_STOP 동안 사용자 입력이 없으면 멈추고, 다시 만지면 재개한다.
 * fn은 상태가 바뀌었으면 true를 돌려준다.
 */
const FAST = 4_000;
const SLOW = 30_000;
const BACKOFF = 1.5;
const IDLE_STOP = 10 * 60_000;

export function usePolling(fn: () => Promise<boolean>) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let delay = FAST;
    let timer = 0;
    let lastInput = Date.now();
    let stopped = false;

    const visible = () => document.visibilityState === "visible";
    const schedule = () => {
      window.clearTimeout(timer);
      if (stopped || !visible() || Date.now() - lastInput > IDLE_STOP) return;
      timer = window.setTimeout(tick, delay);
    };
    const tick = async () => {
      const changed = await fnRef.current().catch(() => false);
      delay = changed ? FAST : Math.min(SLOW, delay * BACKOFF);
      schedule();
    };
    const wake = () => {
      const wasIdle = Date.now() - lastInput > IDLE_STOP;
      lastInput = Date.now();
      if (wasIdle) {
        delay = FAST;
        tick();
      }
    };
    const onVisible = () => {
      if (!visible()) return window.clearTimeout(timer);
      lastInput = Date.now();
      delay = FAST;
      tick();
    };

    schedule();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pointerdown", wake, { passive: true });
    window.addEventListener("keydown", wake);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);
}

export function useNow(ms = 10_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}
