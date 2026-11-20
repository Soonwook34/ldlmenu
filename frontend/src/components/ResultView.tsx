import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Dices, Flag, RotateCcw } from "lucide-react";
import type { AppState } from "../types";
import { cn } from "../utils";
import { brandColor } from "../hooks";
import { RunoffBanner, WinnerCard, candidatesOf, stageLabel } from "./Phase";

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

type Row = { id: number; name: string; category: string; votes: number; voters: string[] };

export function ResultView({
  state,
  mySelection,
  onClose,
  onRandom,
  onReopen,
  onReset,
  onGoVote,
}: {
  state: AppState;
  mySelection: Set<number>;
  onClose: () => void;
  onRandom: () => void;
  onReopen: () => void;
  onReset: () => void;
  onGoVote: () => void;
}) {
  const { status, stage, candidates, prelim } = state.phase;

  // 결승 중에는 후보 전체(0표 포함), 그 외에는 득표한 메뉴만
  const rows = useMemo<Row[]>(() => {
    const all = state.categories.flatMap((c) => c.menus.map((m) => ({ ...m, category: c.name })));
    const list = status === "runoff" || (status === "closed" && candidates.length > 0)
      ? candidatesOf(state.categories, candidates)
      : all.filter((m) => m.votes > 0);
    return list.sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name, "ko"));
  }, [state.categories, status, candidates]);

  const hasVotes = rows.some((r) => r.votes > 0);

  return (
    <div className="space-y-6 pt-4">
      {status === "closed" && <WinnerCard state={state} onReopen={onReopen} onReset={onReset} />}
      {status === "runoff" && <RunoffBanner stage={stage} count={candidates.length} />}

      {status === "open" && !hasVotes ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="py-16 text-center">
          <div className="mb-3 text-5xl">🍽️</div>
          <p className="text-lg font-bold">아직 아무도 투표하지 않았어요</p>
          <p className="mt-1 text-sm text-zinc-500">첫 번째로 메뉴를 골라 보세요</p>
          <button onClick={onGoVote} className="mt-6 h-11 rounded-2xl bg-brand-500 px-6 font-bold text-white">
            투표하러 가기
          </button>
        </motion.div>
      ) : (
        <section>
          {status !== "open" && (
            <h3 className="mb-2 px-1 font-bold text-zinc-500 dark:text-zinc-400">
              {status === "runoff" ? `${stageLabel(stage)} 현황` : "최종 투표"}
            </h3>
          )}
          <RankedList rows={rows} maxVotes={Math.max(1, ...rows.map((r) => r.votes))} mySelection={mySelection} />
        </section>
      )}

      {status !== "closed" && hasVotes && (
        <div className="space-y-2">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onClose}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 text-lg font-bold text-white shadow-lg dark:bg-white dark:text-zinc-900"
          >
            <Flag className="size-5" /> {status === "runoff" ? `${stageLabel(stage)} 마감하기` : "투표 마감하기"}
          </motion.button>
          {status === "open" && (
            <p className="text-center text-sm text-zinc-500">1등이 동점이면 그 메뉴들로 결승 투표가 열려요</p>
          )}
        </div>
      )}
      {status === "runoff" && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onRandom}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white font-semibold text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800"
        >
          <Dices className="size-5" /> 랜덤으로 정하기
        </motion.button>
      )}

      {prelim.length > 0 && (
        <Collapsible title={status === "closed" ? "결승 전 투표 결과" : "예선 결과"}>
          <RankedList rows={prelim.map((m) => ({ ...m, voters: [] }))} maxVotes={Math.max(1, ...prelim.map((m) => m.votes))} compact />
        </Collapsible>
      )}

      <Participation state={state} />

      {status !== "closed" && (
        <button
          onClick={onReset}
          className="mx-auto flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-rose-500 active:bg-rose-50 dark:active:bg-rose-500/10"
        >
          <RotateCcw className="size-4" /> 이번 투표 초기화
        </button>
      )}
    </div>
  );
}

function RankedList({
  rows,
  maxVotes,
  mySelection,
  compact = false,
}: {
  rows: Row[];
  maxVotes: number;
  mySelection?: Set<number>;
  compact?: boolean;
}) {
  return (
    <ol className="space-y-2">
      <AnimatePresence initial={false}>
        {rows.map((m) => {
          const rank = rows.findIndex((x) => x.votes === m.votes) + 1;
          const top = rank === 1 && m.votes > 0 && !compact;
          const mine = mySelection?.has(m.id);
          return (
            <motion.li
              key={m.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className={cn(
                "relative overflow-hidden rounded-2xl ring-1",
                compact ? "p-3" : "p-3.5",
                top
                  ? "bg-gradient-to-br from-brand-50 to-brand2-50 ring-brand-200 dark:from-brand-500/15 dark:to-brand2-500/5 dark:ring-brand-500/30"
                  : "bg-white ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800",
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn("grid w-8 shrink-0 place-items-center font-bold tabular-nums", top ? "text-2xl" : "text-lg text-zinc-400")}>
                  {m.votes > 0 ? (MEDAL[rank] ?? rank) : "–"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("truncate font-bold", top ? "text-lg" : "text-base")}>{m.name}</span>
                    {mine && <span className="shrink-0 rounded-full bg-brand-500 px-1.5 py-0.5 text-xs font-bold text-white">내 선택</span>}
                  </div>
                  <div className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">
                    {m.category}
                    {m.voters.length > 0 && ` · ${m.voters.join(", ")}`}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <motion.span
                    key={m.votes}
                    initial={{ scale: 1.5, color: brandColor() }}
                    animate={{ scale: 1, color: "currentColor" }}
                    className={cn("inline-block font-extrabold tabular-nums", top ? "text-2xl" : "text-xl")}
                  >
                    {m.votes}
                  </motion.span>
                  <span className="ml-0.5 text-xs text-zinc-500">표</span>
                </div>
              </div>
              {!compact && (
                <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <motion.div
                    className={cn("h-full rounded-full", top ? "bg-gradient-to-r from-brand-400 to-brand2-400" : "bg-brand-300 dark:bg-brand-500/60")}
                    initial={{ width: 0 }}
                    animate={{ width: `${(m.votes / maxVotes) * 100}%` }}
                    transition={{ type: "spring", damping: 25, stiffness: 120 }}
                  />
                </div>
              )}
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}

function Collapsible({ title, children }: { title: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex items-center gap-1 px-1 text-sm font-semibold text-zinc-500">
        {title}
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="pt-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function Participation({ state }: { state: AppState }) {
  const voterSet = new Set(state.voters);
  const waiting = state.users.filter((u) => !voterSet.has(u.name));
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
      <h3 className="flex items-baseline gap-1.5 font-bold">
        {state.phase.status === "runoff" ? "결승 참여" : "참여"} <span className="text-brand-500 tabular-nums">{state.voters.length}</span>
        <span className="text-sm font-medium text-zinc-400">/ {state.users.length}명</span>
      </h3>
      {state.voters.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {state.voters.map((name) => (
            <span key={name} className="rounded-full bg-brand-100 px-2.5 py-1 text-sm font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              {name}
            </span>
          ))}
        </div>
      )}
      {waiting.length > 0 && (
        <div className="mt-3">
          <Collapsible title={`아직 안 한 사람 ${waiting.length}명`}>
            <div className="flex flex-wrap gap-1.5">
              {waiting.map((u) => (
                <span key={u.id} className="rounded-full bg-zinc-100 px-2.5 py-1 text-sm text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {u.name}
                </span>
              ))}
            </div>
          </Collapsible>
        </div>
      )}
    </section>
  );
}
