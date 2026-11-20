import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Moon, Settings, Sun, Timer } from "lucide-react";
import { fetchState, post } from "./api";
import type { AppState, User } from "./types";
import { useAccent, useNow, usePolling, usePref, useTheme, type MenuOrder } from "./hooks";
import { Logo } from "./components/Logo";
import { cn, remainingLabel, sameSet } from "./utils";
import { Segmented, useUI } from "./components/ui";
import { ALL, MenuGrid, VoteFilters } from "./components/VoteView";
import { ActionBar } from "./components/ActionBar";
import { ResultView } from "./components/ResultView";
import { RunoffVote, WinnerCard, fireConfetti, stageLabel } from "./components/Phase";
import { NamePicker, SettingsSheet, type Act, type Prefs } from "./components/Sheets";

type Tab = "vote" | "result";

export default function App() {
  const [state, setState] = useState<AppState | null>(() => window.__STATE__ ?? null);
  const lastJson = useRef(state ? JSON.stringify(state) : "");

  const apply = useCallback((next: AppState) => {
    const json = JSON.stringify(next);
    if (json === lastJson.current) return false;
    lastJson.current = json;
    setState(next);
    return true;
  }, []);

  const refresh = useCallback(async () => {
    try {
      return apply(await fetchState());
    } catch {
      return false; // 폴링 실패는 조용히 넘기고 다음 주기에 다시 시도
    }
  }, [apply]);

  useEffect(() => {
    if (!state) refresh(); // 개발 서버(vite)에서는 초기 상태가 주입되지 않는다
  }, [state, refresh]);
  usePolling(refresh);

  if (!state) {
    return <div className="grid min-h-dvh place-items-center text-zinc-400">불러오는 중…</div>;
  }
  return <Main state={state} apply={apply} refresh={refresh} />;
}

function Main({
  state,
  apply,
  refresh,
}: {
  state: AppState;
  apply: (s: AppState) => boolean;
  refresh: () => Promise<boolean>;
}) {
  const { toast, confirm } = useUI();
  const theme = useTheme();
  const [order, setOrder] = usePref<MenuOrder>("menuOrder", "random");
  const [accent, setAccent] = useAccent();
  const prefs: Prefs = { theme: theme.mode, setTheme: theme.setMode, order, setOrder, accent, setAccent };
  const now = useNow();
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(location.search).get("tab") === "result" ? "result" : "vote"));
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const [searching, setSearching] = useState(false);
  const [selection, setSelection] = useState(() => new Set(state.my_selection));
  const [busy, setBusy] = useState(false);
  const [nameOpen, setNameOpen] = useState(() => !state.me);
  const [onboarding, setOnboarding] = useState(() => !state.me); // 이 기기에 이름이 없으면 첫 방문 화면
  const [settingsOpen, setSettingsOpen] = useState(false);
  const voteButton = useRef<HTMLButtonElement>(null);
  const listTop = useRef<HTMLDivElement>(null);

  const phase = state.phase;
  const runoff = phase.status === "runoff";
  const closed = phase.status === "closed";

  // 서버의 내 투표가 바뀌면(투표·초기화·회차 변경·이름 변경), 내가 손대지 않은 선택은 따라간다
  const saved = state.my_selection;
  const prevSaved = useRef(saved);
  useEffect(() => {
    setSelection((cur) => (sameSet(cur, prevSaved.current) ? new Set(saved) : cur));
    prevSaved.current = saved;
  }, [saved]);

  // 진행 단계가 바뀌면(결승 시작 등) 선택을 서버 기준으로 맞춘다
  const phaseKey = `${phase.status}:${phase.stage}`;
  useEffect(() => {
    setSelection(new Set(prevSaved.current));
  }, [phaseKey]);

  // 삭제된 메뉴는 선택에서 뺀다
  const menuById = useMemo(
    () => new Map(state.categories.flatMap((c) => c.menus.map((m) => [m.id, m] as const))),
    [state.categories],
  );
  useEffect(() => {
    setSelection((cur) => ([...cur].every((id) => menuById.has(id)) ? cur : new Set([...cur].filter((id) => menuById.has(id)))));
  }, [menuById]);

  // 초기화 시각이 지나면 새 회차 상태를 받아온다
  const nextReset = state.round.next_reset;
  useEffect(() => {
    if (nextReset && now / 1000 >= nextReset) refresh();
  }, [now, nextReset, refresh]);

  // 검색·필터로 목록 길이가 바뀌어도 상단 고정 영역이 제자리에 있도록 스크롤을 맞춘다
  useLayoutEffect(() => {
    const top = listTop.current ? listTop.current.getBoundingClientRect().top + window.scrollY : 0;
    if (window.scrollY > top) window.scrollTo({ top });
  }, [query, category]);

  const act: Act = useCallback(
    async (path, body, success) => {
      try {
        apply(await post(path, body));
        if (success) toast(success, "success");
        return true;
      } catch (e) {
        toast((e as Error).message, "error");
        return false;
      }
    },
    [apply, toast],
  );

  const toggle = useCallback(
    (id: number) => {
      navigator.vibrate?.(8);
      setSelection((cur) => {
        if (runoff) return cur.has(id) ? new Set() : new Set([id]); // 결승은 하나만
        const next = new Set(cur);
        if (!next.delete(id)) next.add(id);
        return next;
      });
    },
    [runoff],
  );

  const selectMany = useCallback((ids: number[], select: boolean) => {
    navigator.vibrate?.(12);
    setSelection((cur) => {
      const next = new Set(cur);
      ids.forEach((id) => (select ? next.add(id) : next.delete(id)));
      return next;
    });
  }, []);

  const submit = async () => {
    if (!state.me) return setNameOpen(true);
    setBusy(true);
    const ok = await act("/api/vote", { user_id: state.me.id, menu_ids: [...selection] });
    setBusy(false);
    if (ok) {
      const rect = voteButton.current?.getBoundingClientRect();
      fireConfetti(rect && { x: (rect.left + rect.width / 2) / window.innerWidth, y: rect.top / window.innerHeight });
      toast(`${state.me.name} 님 투표 완료!`, "success");
      window.setTimeout(() => {
        setTab("result");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 700);
    }
  };

  const cancelVote = async () => {
    if (!state.me) return;
    if (!(await confirm({ title: "내 투표를 취소할까요?", confirmText: "투표 취소", danger: true }))) return;
    setSelection(new Set());
    await act("/api/vote", { user_id: state.me.id, menu_ids: [] }, "투표를 취소했어요");
  };

  const closeVote = async () => {
    const ok = await confirm({
      title: runoff ? `${stageLabel(phase.stage)}을 마감할까요?` : "투표를 마감할까요?",
      message: "1등이 하나면 바로 확정되고, 동점이면 그 메뉴들로 결승 투표가 열려요.",
      confirmText: "마감",
    });
    if (ok) await act("/api/close", {});
  };

  const randomPick = async () => {
    const ok = await confirm({ title: "랜덤으로 정할까요?", message: "1등 후보 중 하나를 무작위로 골라 확정해요.", confirmText: "🎲 굴리기" });
    if (ok) await act("/api/close", { random: true });
  };

  const reopen = async () => {
    const ok = await confirm({ title: "마감을 취소할까요?", message: "마감 직전 상태로 돌아가 다시 투표할 수 있어요." });
    if (ok) await act("/api/reopen", {}, "마감을 취소했어요");
  };

  const reset = async () => {
    const ok = await confirm({
      title: "투표를 초기화할까요?",
      message: "모든 사람의 이번 투표가 삭제되고 되돌릴 수 없어요.",
      confirmText: "초기화",
      danger: true,
    });
    if (ok && (await act("/api/reset", {}, "새 투표를 시작해요"))) setTab("vote");
  };

  const pickName = async (user: User) => {
    if (await act("/api/me", { user_id: user.id }, `안녕하세요, ${user.name} 님!`)) {
      setNameOpen(false);
      setOnboarding(false);
    }
  };

  const voted = saved.length > 0;
  const dirty = !sameSet(selection, saved);
  const selected = [...selection].map((id) => menuById.get(id)).filter((m) => m !== undefined);
  const participation = state.users.length ? state.voters.length / state.users.length : 0;

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-44">
      {/* 머리말 */}
      <header className="flex items-center justify-between pt-[max(env(safe-area-inset-top),12px)] pb-1">
        <h1 className="flex items-center gap-2 py-1.5 text-[22px] tracking-tight">
          <Logo className="size-9 shrink-0" />
          <span>
            LearnData Lab <span className="text-brand-500">MENU</span>
          </span>
        </h1>
        <div className="flex gap-1">
          <button
            aria-label={theme.dark ? "라이트 모드로" : "다크 모드로"}
            onClick={() => theme.setMode(theme.dark ? "light" : "dark")}
            className="grid size-10 place-items-center rounded-full text-zinc-500 active:bg-zinc-200 dark:text-zinc-400 dark:active:bg-zinc-800"
          >
            <motion.span key={String(theme.dark)} initial={{ rotate: -90, scale: 0.5 }} animate={{ rotate: 0, scale: 1 }}>
              {theme.dark ? <Moon className="size-5" /> : <Sun className="size-5" />}
            </motion.span>
          </button>
          <button
            aria-label="설정"
            onClick={() => setSettingsOpen(true)}
            className="grid size-10 place-items-center rounded-full text-zinc-500 active:bg-zinc-200 dark:text-zinc-400 dark:active:bg-zinc-800"
          >
            <Settings className="size-5" />
          </button>
        </div>
      </header>

      {/* 회차 카드 */}
      <section className="mt-1 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[28px] leading-tight">{state.round.name} 투표</h2>
              <AnimatePresence mode="popLayout">
                {phase.status !== "open" && (
                  <motion.span
                    key={phaseKey}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold text-white",
                      runoff ? "bg-rose-500" : "bg-emerald-500",
                    )}
                  >
                    {runoff ? `🔥 ${stageLabel(phase.stage)}` : "마감"}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>
          <button
            onClick={() => setNameOpen(true)}
            className="flex h-9 shrink-0 items-center gap-0.5 rounded-full bg-zinc-100 pr-2 pl-3 text-sm font-semibold dark:bg-zinc-800"
          >
            {state.me ? `${state.me.name} 님` : "이름 선택"}
            <ChevronDown className="size-4 text-zinc-400" />
          </button>
        </div>
        {/* 이름 버튼 옆이 아니라 카드 전체 폭을 쓰게 해서 줄바꿈을 막는다. 좁은 화면에서도 '·' 사이에서만 꺾인다 */}
        {state.round.next_reset && (
          <p className="mt-1 flex flex-wrap items-center gap-x-1 text-sm text-zinc-500 dark:text-zinc-400">
            <Timer className="size-4 shrink-0" />
            <span className="whitespace-nowrap">{state.round.next_reset_label} 초기화 ·</span>
            <span className="whitespace-nowrap">{remainingLabel(state.round.next_reset - now / 1000)}</span>
          </p>
        )}
        <div className="mt-4 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand2-400"
              initial={false}
              animate={{ width: `${participation * 100}%` }}
              transition={{ type: "spring", damping: 25, stiffness: 120 }}
            />
          </div>
          <span className="text-sm font-semibold text-zinc-500 tabular-nums dark:text-zinc-400">
            {state.voters.length}/{state.users.length}명 {runoff ? "결승 참여" : "참여"}
          </span>
        </div>
      </section>

      {/* 상단 고정: 탭 + (투표 탭) 검색·카테고리 */}
      <div ref={listTop} />
      <div className="sticky top-0 z-20 -mx-4 bg-zinc-50/85 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-2 backdrop-blur-xl dark:bg-zinc-950/85">
        <Segmented
          id="main-tab"
          value={tab}
          onChange={(t) => {
            setTab(t);
            window.scrollTo({ top: 0 });
          }}
          options={[
            { value: "vote", label: runoff ? "결승 투표" : "투표" },
            {
              value: "result",
              label: (
                <>
                  결과
                  {state.voters.length > 0 && (
                    <span className="rounded-full bg-brand-500 px-1.5 text-xs leading-5 font-bold text-white tabular-nums">
                      {state.voters.length}
                    </span>
                  )}
                </>
              ),
            },
          ]}
        />
        {tab === "vote" && phase.status === "open" && (
          <VoteFilters
            categories={state.categories}
            query={query}
            setQuery={setQuery}
            category={category}
            setCategory={setCategory}
            onFocusChange={setSearching}
          />
        )}
      </div>

      <motion.main
        key={`${tab}:${phase.status}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="min-h-dvh"
      >
        {tab === "result" ? (
          <ResultView
            state={state}
            mySelection={new Set(saved)}
            onClose={closeVote}
            onRandom={randomPick}
            onReopen={reopen}
            onReset={reset}
            onGoVote={() => setTab("vote")}
          />
        ) : closed ? (
          <WinnerCard state={state} onReopen={reopen} onReset={reset} />
        ) : runoff ? (
          <RunoffVote state={state} selection={selection} onToggle={toggle} />
        ) : (
          <MenuGrid
            categories={state.categories}
            query={query}
            category={category}
            selection={selection}
            onToggle={toggle}
            onSelectMany={selectMany}
            order={order}
            setOrder={setOrder}
          />
        )}
      </motion.main>

      {tab === "vote" && !closed && !searching && (
        <ActionBar
          ref={voteButton}
          me={state.me}
          selected={selected}
          voted={voted}
          dirty={dirty}
          busy={busy}
          runoff={runoff}
          onRemove={toggle}
          onSubmit={submit}
          onCancelVote={cancelVote}
          onPickName={() => setNameOpen(true)}
          onShowResult={() => {
            setTab("result");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      <NamePicker
        open={nameOpen}
        onClose={() => setNameOpen(false)}
        users={state.users}
        me={state.me}
        onPick={pickName}
        onboarding={onboarding && !state.me}
        prefs={prefs}
      />
      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        state={state}
        act={act}
        prefs={prefs}
        onChangeName={() => {
          setSettingsOpen(false);
          setNameOpen(true);
        }}
      />
    </div>
  );
}
