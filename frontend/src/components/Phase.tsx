import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import confetti from "canvas-confetti";
import { Check, Flame, RotateCcw, Undo2 } from "lucide-react";
import type { AppState, Category } from "../types";
import { cn } from "../utils";
import { brandColor } from "../hooks";

const celebrated = new Set<string>(); // 같은 결과로 꽃가루를 두 번 터뜨리지 않는다

export function fireConfetti(origin?: { x: number; y: number }) {
  const colors = [brandColor("--brand-500"), brandColor("--brand2-400"), brandColor("--brand-300"), "#fb7185", "#34d399"];
  confetti({ particleCount: 90, spread: 75, startVelocity: 38, origin: origin ?? { y: 0.6 }, colors, disableForReducedMotion: true });
}

export function stageLabel(stage: number) {
  return stage > 1 ? `${stage}차 결승` : "결승";
}

/** 마감된 투표의 1등 발표 카드 */
export function WinnerCard({
  state,
  onReopen,
  onReset,
}: {
  state: AppState;
  onReopen: () => void;
  onReset: () => void;
}) {
  const { winner, decided_by, can_reopen } = state.phase;
  const votes = winner ? state.categories.flatMap((c) => c.menus).find((m) => m.id === winner.id)?.votes ?? 0 : 0;

  useEffect(() => {
    const key = `${state.round.start}:${winner?.id}`;
    if (winner && !celebrated.has(key)) {
      celebrated.add(key);
      window.setTimeout(() => {
        fireConfetti({ x: 0.5, y: 0.35 });
        window.setTimeout(() => fireConfetti({ x: 0.2, y: 0.5 }), 250);
        window.setTimeout(() => fireConfetti({ x: 0.8, y: 0.5 }), 400);
      }, 300);
    }
  }, [state.round.start, winner]);

  return (
    <div className="pt-4">
      <motion.div
        initial={{ scale: 0.85, opacity: 0, rotate: -2 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: "spring", damping: 14, stiffness: 180 }}
        className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-brand-500 via-brand-400 to-brand2-400 px-6 py-8 text-center text-white shadow-xl shadow-brand-500/30"
      >
        <div className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-white/15" />
        <div className="pointer-events-none absolute -bottom-12 -left-8 size-36 rounded-full bg-white/10" />
        <p className="relative text-sm font-semibold opacity-90">오늘의 {state.round.name} 메뉴는</p>
        <motion.div
          className="relative my-2 text-6xl"
          animate={{ y: [0, -10, 0], rotate: [0, -6, 6, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 1.2 }}
        >
          🏆
        </motion.div>
        <h2 className="relative text-[44px] leading-tight break-keep [overflow-wrap:anywhere]">{winner?.name ?? "삭제된 메뉴"}</h2>
        <p className="relative mt-2 text-sm font-semibold opacity-90">
          {winner?.category}
          {decided_by === "random" ? " · 🎲 랜덤으로 결정" : votes > 0 ? ` · ${votes}표` : ""}
        </p>
      </motion.div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {can_reopen && (
          <button onClick={onReopen} className="flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-white font-semibold text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800">
            <Undo2 className="size-4" /> 마감 취소
          </button>
        )}
        <button
          onClick={onReset}
          className={cn(
            "flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-white font-semibold text-rose-500 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800",
            !can_reopen && "col-span-2",
          )}
        >
          <RotateCcw className="size-4" /> 새 투표 시작
        </button>
      </div>
    </div>
  );
}

/** 결승 안내 배너 */
export function RunoffBanner({ stage, count }: { stage: number; count: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-rose-500 to-brand-500 p-4 text-white shadow-lg shadow-rose-500/20"
    >
      <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
        <Flame className="size-8" />
      </motion.div>
      <div>
        <p className="text-xl">{stageLabel(stage)}전!</p>
        <p className="text-sm opacity-90">1등이 {count}개로 동점이에요. 딱 하나만 골라 주세요.</p>
      </div>
    </motion.div>
  );
}

/** 결승 투표 화면: 후보만 크게, 하나만 선택 */
export function RunoffVote({
  state,
  selection,
  onToggle,
}: {
  state: AppState;
  selection: Set<number>;
  onToggle: (id: number) => void;
}) {
  const { candidates, prelim, stage } = state.phase;
  const menus = candidatesOf(state.categories, candidates);
  const prelimVotes = new Map(prelim.map((m) => [m.id, m.votes]));

  return (
    <div className="space-y-3 pt-4">
      <RunoffBanner stage={stage} count={menus.length} />
      <AnimatePresence initial={false}>
        {menus.map((m, i) => {
          const selected = selection.has(m.id);
          return (
            <motion.button
              key={m.id}
              initial={{ opacity: 0, x: i % 2 ? 24 : -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, type: "spring", damping: 22, stiffness: 260 }}
              whileTap={{ scale: 0.97 }}
              aria-pressed={selected}
              onClick={() => onToggle(m.id)}
              className={cn(
                "flex w-full items-center gap-4 rounded-3xl p-5 text-left transition-colors",
                selected
                  ? "bg-brand-500 text-white shadow-lg shadow-brand-500/30"
                  : "bg-white ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800",
              )}
            >
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full ring-2",
                  selected ? "bg-white text-brand-500 ring-white" : "ring-zinc-300 dark:ring-zinc-600",
                )}
              >
                {selected && <Check className="size-4" strokeWidth={3.5} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-2xl">{m.name}</span>
                <span className={cn("text-sm", selected ? "text-white/80" : "text-zinc-500 dark:text-zinc-400")}>
                  {m.category} · 예선 {prelimVotes.get(m.id) ?? 0}표
                </span>
              </span>
              {m.votes > 0 && (
                <motion.span
                  key={m.votes}
                  initial={{ scale: 1.5 }}
                  animate={{ scale: 1 }}
                  className={cn("shrink-0 text-2xl font-extrabold tabular-nums", selected ? "text-white" : "text-brand-500")}
                >
                  {m.votes}
                  <span className="ml-0.5 text-xs font-semibold opacity-70">표</span>
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function candidatesOf(categories: Category[], ids: number[]) {
  const all = categories.flatMap((c) => c.menus.map((m) => ({ ...m, category: c.name })));
  return ids.map((id) => all.find((m) => m.id === id)).filter((m) => m !== undefined);
}
