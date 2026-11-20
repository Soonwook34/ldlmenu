import { forwardRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, LoaderCircle, Undo2, X } from "lucide-react";
import type { User } from "../types";
import { cn } from "../utils";

type Props = {
  me: User | null;
  selected: { id: number; name: string }[];
  voted: boolean; // 이번 회차에 이미 투표함
  dirty: boolean; // 서버에 저장된 내 투표와 지금 선택이 다름
  busy: boolean;
  runoff: boolean; // 결승: 한 개만 고른다
  onRemove: (id: number) => void;
  onSubmit: () => void;
  onCancelVote: () => void;
  onPickName: () => void;
};

/** 화면 하단 고정 바: 고른 메뉴 칩 + 투표 버튼 */
export const ActionBar = forwardRef<HTMLButtonElement, Props>(function ActionBar(
  { me, selected, voted, dirty, busy, runoff, onRemove, onSubmit, onCancelVote, onPickName },
  buttonRef,
) {
  const count = selected.length;
  let label: string;
  let action = onSubmit;
  let disabled = false;
  let done = false;

  if (!me) {
    label = "이름 고르고 투표하기";
    action = onPickName;
  } else if (count === 0 && voted) {
    label = "투표 취소하기";
    action = onCancelVote;
  } else if (count === 0) {
    label = runoff ? "결승 메뉴를 하나 골라 주세요" : "메뉴를 골라 주세요";
    disabled = true;
  } else if (voted && !dirty) {
    label = "투표 완료";
    disabled = true;
    done = true;
  } else {
    label = runoff
      ? voted ? "결승 다시 투표" : "결승 투표하기"
      : voted ? `${count}개로 다시 투표` : `${count}개 투표하기`;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
      <div className="pointer-events-auto mx-auto max-w-lg bg-gradient-to-t from-zinc-50 from-60% to-transparent px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+12px)] dark:from-zinc-950">
        <AnimatePresence initial={false}>
          {count > 0 && !runoff && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-2.5">
                <AnimatePresence initial={false} mode="popLayout">
                  {selected.map((m) => (
                    <motion.button
                      key={m.id}
                      layout
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.6, opacity: 0 }}
                      onClick={() => onRemove(m.id)}
                      className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-brand-100 pr-2 pl-3 text-sm font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                    >
                      {m.name}
                      <X className="size-3.5 opacity-60" />
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-2">
          {voted && count > 0 && (
            <motion.button
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 56, opacity: 1 }}
              whileTap={{ scale: 0.94 }}
              aria-label="내 투표 취소"
              onClick={onCancelVote}
              className="grid h-14 shrink-0 place-items-center rounded-2xl bg-white text-zinc-500 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-800"
            >
              <Undo2 className="size-5" />
            </motion.button>
          )}
          <motion.button
            ref={buttonRef}
            whileTap={disabled ? undefined : { scale: 0.97 }}
            disabled={disabled || busy}
            onClick={action}
            className={cn(
              "flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl text-lg font-bold shadow-lg transition-colors",
              done
                ? "bg-emerald-500 text-white shadow-emerald-500/25"
                : disabled
                  ? "bg-zinc-200 text-zinc-400 shadow-none dark:bg-zinc-800 dark:text-zinc-500"
                  : "bg-brand-500 text-white shadow-brand-500/30",
            )}
          >
            {busy ? (
              <LoaderCircle className="size-5 animate-spin" />
            ) : (
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={label}
                  initial={{ y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -12, opacity: 0 }}
                  className="flex items-center gap-1.5"
                >
                  {done && <Check className="size-5" strokeWidth={3} />}
                  {label}
                </motion.span>
              </AnimatePresence>
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
});
