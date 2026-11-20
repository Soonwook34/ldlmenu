import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { CircleAlert, CircleCheck, X } from "lucide-react";
import { cn } from "../utils";

// ------------------------------------------------------------------ 토스트 · 확인창

type ToastKind = "info" | "success" | "error";
type Toast = { id: number; message: string; kind: ToastKind };
type ConfirmOptions = { title: string; message?: string; confirmText?: string; danger?: boolean };
type PromptOptions = { title: string; message?: string; placeholder?: string; initial?: string; confirmText?: string };
type ChooseOptions<T> = { title: string; message?: string; options: { value: T; label: ReactNode }[] };

type Dialog =
  | (ConfirmOptions & { kind: "confirm"; resolve: (ok: boolean) => void })
  | (PromptOptions & { kind: "prompt"; resolve: (value: string | null) => void })
  | (ChooseOptions<unknown> & { kind: "choose"; resolve: (value: unknown) => void });

type UI = {
  toast: (message: string, kind?: ToastKind) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** 한 줄 입력. 취소하면 null */
  prompt: (options: PromptOptions) => Promise<string | null>;
  /** 목록에서 하나 고르기. 취소하면 null */
  choose: <T>(options: ChooseOptions<T>) => Promise<T | null>;
};

const UIContext = createContext<UI | null>(null);

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("UIProvider가 필요합니다");
  return ctx;
}

let toastSeq = 0;

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = ++toastSeq;
    setToasts((list) => [...list.slice(-2), { id, message, kind }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 2400);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ ...options, kind: "confirm", resolve })),
    [],
  );
  const prompt = useCallback(
    (options: PromptOptions) => new Promise<string | null>((resolve) => setDialog({ ...options, kind: "prompt", resolve })),
    [],
  );
  const choose = useCallback(
    <T,>(options: ChooseOptions<T>) =>
      new Promise<T | null>((resolve) =>
        setDialog({ ...(options as ChooseOptions<unknown>), kind: "choose", resolve: resolve as (v: unknown) => void }),
      ),
    [],
  );

  /** 결과를 넘기고 닫는다. 취소는 confirm → false, 나머지 → null */
  const close = (result?: unknown) => {
    if (!dialog) return;
    if (dialog.kind === "confirm") dialog.resolve(result === true);
    else dialog.resolve((result ?? null) as never);
    setDialog(null);
  };

  const value = useMemo(() => ({ toast, confirm, prompt, choose }), [toast, confirm, prompt, choose]);

  return (
    <UIContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),12px)] z-[70] flex flex-col items-center gap-2 px-4">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              role="status"
              className="flex items-center gap-2 rounded-full bg-zinc-900/95 px-4 py-2.5 text-sm font-medium text-white shadow-lg backdrop-blur dark:bg-zinc-100/95 dark:text-zinc-900"
            >
              {t.kind === "success" && <CircleCheck className="size-4 text-emerald-400 dark:text-emerald-600" />}
              {t.kind === "error" && <CircleAlert className="size-4 text-rose-400 dark:text-rose-600" />}
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {dialog && (
          <motion.div
            className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-6 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => close(null)}
          >
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-title"
              className="w-full max-w-xs rounded-3xl bg-white p-6 shadow-2xl dark:bg-zinc-900"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 400 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="confirm-title" className="text-lg font-bold">{dialog.title}</h2>
              {dialog.message && (
                <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-zinc-500 dark:text-zinc-400">{dialog.message}</p>
              )}
              {dialog.kind === "confirm" && (
                <DialogButtons
                  onCancel={() => close(false)}
                  onConfirm={() => close(true)}
                  confirmText={dialog.confirmText ?? "확인"}
                  danger={dialog.danger}
                />
              )}
              {dialog.kind === "prompt" && <PromptBody dialog={dialog} onDone={close} />}
              {dialog.kind === "choose" && (
                <div className="mt-4 space-y-2">
                  {dialog.options.map((o, i) => (
                    <button
                      key={i}
                      onClick={() => close(o.value)}
                      className="flex h-12 w-full items-center rounded-2xl bg-zinc-100 px-4 text-left font-semibold active:scale-[0.98] dark:bg-zinc-800"
                    >
                      {o.label}
                    </button>
                  ))}
                  <button onClick={() => close(null)} className="h-11 w-full font-semibold text-zinc-500">
                    취소
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </UIContext.Provider>
  );
}

function DialogButtons({
  onCancel,
  onConfirm,
  confirmText,
  danger,
  disabled,
  submit,
}: {
  onCancel: () => void;
  onConfirm?: () => void;
  confirmText: string;
  danger?: boolean;
  disabled?: boolean;
  submit?: boolean;
}) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-2">
      <button
        type="button"
        className="h-12 rounded-2xl bg-zinc-100 font-semibold text-zinc-700 active:scale-[0.97] dark:bg-zinc-800 dark:text-zinc-200"
        onClick={onCancel}
      >
        취소
      </button>
      <button
        type={submit ? "submit" : "button"}
        autoFocus={!submit}
        disabled={disabled}
        className={cn(
          "h-12 rounded-2xl font-semibold text-white active:scale-[0.97] disabled:opacity-40",
          danger ? "bg-rose-500" : "bg-brand-500",
        )}
        onClick={onConfirm}
      >
        {confirmText}
      </button>
    </div>
  );
}

function PromptBody({ dialog, onDone }: { dialog: PromptOptions; onDone: (value?: unknown) => void }) {
  const [value, setValue] = useState(dialog.initial ?? "");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) onDone(value.trim());
  };
  return (
    <form onSubmit={submit}>
      <input
        autoFocus
        value={value}
        maxLength={20}
        enterKeyHint="done"
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        placeholder={dialog.placeholder}
        className="mt-4 h-12 w-full rounded-2xl bg-zinc-100 px-4 text-[17px] outline-none focus:ring-2 focus:ring-brand-400 dark:bg-zinc-800"
      />
      <DialogButtons onCancel={() => onDone(null)} confirmText={dialog.confirmText ?? "확인"} disabled={!value.trim()} submit />
    </form>
  );
}

// ------------------------------------------------------------------ 바텀 시트

export function Sheet({
  open,
  onClose,
  title,
  children,
  tall = false,
  scrollKey,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  tall?: boolean;
  scrollKey?: string; // 바뀌면 스크롤을 맨 위로 (탭 전환 등)
}) {
  const drag = useDragControls();
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // 최신 Chrome은 scrollTo가 Promise를 돌려준다: 그대로 반환하면 React가 정리 함수로 착각해 오류가 난다
    body.current?.scrollTo({ top: 0 });
  }, [scrollKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // 뒤 화면 스크롤 잠금: html에 걸어야 scrollbar-gutter가 유지되어 폭이 바뀌지 않는다
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-lg flex-col rounded-t-[28px] bg-white shadow-2xl dark:bg-zinc-900",
              tall ? "h-[88dvh]" : "max-h-[88dvh]",
            )}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            drag="y"
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(_, info) => (info.offset.y > 100 || info.velocity.y > 500) && onClose()}
          >
            <div className="shrink-0 touch-none px-5 pt-3 pb-2" onPointerDown={(e) => drag.start(e)}>
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-200 dark:bg-zinc-700" />
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">{title}</h2>
                <button
                  aria-label="닫기"
                  className="grid size-9 place-items-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  onClick={onClose}
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>
            <div ref={body} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+20px)]">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ------------------------------------------------------------------ 세그먼트 컨트롤

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  id,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  id: string; // 같은 화면에 여러 개 있을 때 애니메이션이 섞이지 않도록
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex rounded-2xl bg-zinc-200/70 p-1 dark:bg-zinc-800/80", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-[17px] font-semibold transition-colors",
            value === o.value ? "text-zinc-900 dark:text-white" : "text-zinc-500 dark:text-zinc-400",
          )}
        >
          {value === o.value && (
            <motion.span
              layoutId={`seg-${id}`}
              className="absolute inset-0 rounded-xl bg-white shadow-sm dark:bg-zinc-700"
              transition={{ type: "spring", damping: 30, stiffness: 400 }}
            />
          )}
          <span className="relative flex items-center gap-1.5">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
