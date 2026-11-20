import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDownAZ,
  ArrowRightLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ListChecks,
  Monitor,
  Moon,
  Palette,
  Pencil,
  Plus,
  Settings2,
  Shuffle,
  Sun,
  Trash2,
  UserRound,
  Utensils,
} from "lucide-react";
import type { AppState, RoundSetting, User } from "../types";
import { ACCENTS, type Accent, type MenuOrder, type ThemeMode } from "../hooks";
import { cn, matches } from "../utils";
import { Segmented, Sheet, useUI } from "./ui";

/** 변경 요청을 보내고 성공 여부를 돌려준다 (오류는 토스트로 표시) */
export type Act = (path: string, body?: unknown, success?: string) => Promise<boolean>;

// ------------------------------------------------------------------ 이름 선택

/** 이 기기에만 저장되는 개인 설정 묶음 */
export type Prefs = {
  theme: ThemeMode;
  setTheme: (m: ThemeMode) => void;
  order: MenuOrder;
  setOrder: (o: MenuOrder) => void;
  accent: Accent;
  setAccent: (a: Accent) => void;
};

/**
 * 이름 선택.
 * - onboarding(이 기기에 이름이 없을 때): 이름 + 테마 색 + 화면 모드 + 메뉴 순서를 한 번에 고르고 '시작하기'
 * - 그 외: 이름만 바로 바꾼다
 */
export function NamePicker({
  open,
  onClose,
  users,
  me,
  onPick,
  onboarding,
  prefs,
}: {
  open: boolean;
  onClose: () => void;
  users: User[];
  me: User | null;
  onPick: (user: User) => void;
  onboarding: boolean;
  prefs: Prefs;
}) {
  const [picked, setPicked] = useState<User | null>(null);
  // 첫 방문은 두 단계: 1) 이름 → 2) 화면 설정 + 시작하기 (이름이 많아도 설정을 건너뛰지 않게)
  const [step, setStep] = useState<"name" | "prefs">("name");
  const prefsStep = onboarding && step === "prefs" && picked !== null;
  const selectedId = onboarding ? picked?.id : me?.id;

  const title = !onboarding ? "누구세요?" : prefsStep ? `${picked.name} 님, 반가워요! 👋` : "반가워요! 👋";

  return (
    <Sheet open={open} onClose={onClose} title={title} tall={onboarding} scrollKey={prefsStep ? "prefs" : "name"}>
      {onboarding && <StepDots step={prefsStep ? 2 : 1} />}
      <AnimatePresence mode="wait" initial={false}>
        {prefsStep ? (
          <motion.div
            key="prefs"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.15 }}
          >
            <p className="mb-5 text-sm text-zinc-500 dark:text-zinc-400">
              화면을 내 취향대로 골라 보세요. 이 기기에만 저장되고, 설정에서 언제든 바꿀 수 있어요.
            </p>
            <PrefPickers prefs={prefs} idPrefix="onboarding" />
            <div className="sticky bottom-0 -mx-5 mt-6 flex gap-2 bg-gradient-to-t from-white from-70% to-transparent px-5 pt-4 dark:from-zinc-900">
              <motion.button
                whileTap={{ scale: 0.94 }}
                aria-label="이름 다시 고르기"
                onClick={() => setStep("name")}
                className="grid size-14 shrink-0 place-items-center rounded-2xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              >
                <ChevronLeft className="size-6" />
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => onPick(picked)}
                className="h-14 flex-1 rounded-2xl bg-brand-500 text-lg font-bold text-white shadow-lg shadow-brand-500/30"
              >
                시작하기
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="name"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.15 }}
          >
            <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
              {onboarding
                ? "이 기기에서 쓸 이름을 골라 주세요. 다음 단계에서 테마 색과 화면 모드도 고를 수 있어요."
                : "한 번 고르면 이 기기에서 계속 기억해요. 목록에 없으면 설정 › 사용자에서 추가할 수 있어요."}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {users.map((u) => (
                <motion.button
                  key={u.id}
                  whileTap={{ scale: 0.93 }}
                  onClick={() => {
                    if (!onboarding) return onPick(u);
                    setPicked(u);
                    setStep("prefs");
                  }}
                  aria-pressed={selectedId === u.id}
                  className={cn(
                    "h-12 truncate rounded-2xl px-2 font-semibold transition-colors",
                    selectedId === u.id ? "bg-brand-500 text-white" : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100",
                  )}
                >
                  {u.name}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
}

/** 첫 방문 화면의 단계 표시 (1 이름 · 2 화면) */
function StepDots({ step }: { step: 1 | 2 }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-zinc-400">
      {(["이름", "화면 설정"] as const).map((label, i) => (
        <span key={label} className={cn("flex items-center gap-1.5", step === i + 1 && "text-brand-500")}>
          {i > 0 && <span className="h-px w-4 bg-zinc-300 dark:bg-zinc-700" />}
          <span
            className={cn(
              "grid size-5 place-items-center rounded-full text-[11px] text-white",
              step >= i + 1 ? "bg-brand-500" : "bg-zinc-300 dark:bg-zinc-700",
            )}
          >
            {i + 1}
          </span>
          {label}
        </span>
      ))}
    </div>
  );
}

/** 테마 색 · 화면 모드 · 메뉴 순서 고르기 (첫 방문 화면과 설정에서 함께 쓴다) */
export function PrefPickers({ prefs, idPrefix }: { prefs: Prefs; idPrefix: string }) {
  const { theme, setTheme, order, setOrder, accent, setAccent } = prefs;
  return (
    <div className="space-y-5">
      <div>
        <h4 className="mb-2 text-sm font-semibold text-zinc-500">테마 색</h4>
        <div role="radiogroup" aria-label="테마 색" className="grid grid-cols-5 gap-2">
          {ACCENTS.map((a) => (
            <button
              key={a.value}
              role="radio"
              aria-checked={accent === a.value}
              onClick={() => setAccent(a.value)}
              data-accent={a.value}
              className="flex flex-col items-center gap-1.5 rounded-2xl py-1.5 text-sm text-zinc-600 dark:text-zinc-300"
            >
              <span
                className={cn(
                  "grid size-11 place-items-center rounded-full bg-brand-500 text-white ring-offset-2 ring-offset-white transition-shadow dark:ring-offset-zinc-900",
                  accent === a.value && "ring-2 ring-brand-500",
                )}
              >
                {accent === a.value && <Check className="size-5" strokeWidth={3} />}
              </span>
              {a.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <h4 className="mb-2 text-sm font-semibold text-zinc-500">화면 모드</h4>
        <Segmented
          id={`${idPrefix}-theme`}
          value={theme}
          onChange={setTheme}
          options={[
            { value: "system", label: <><Monitor className="size-4" />시스템</> },
            { value: "light", label: <><Sun className="size-4" />라이트</> },
            { value: "dark", label: <><Moon className="size-4" />다크</> },
          ]}
        />
      </div>
      <div>
        <h4 className="mb-2 text-sm font-semibold text-zinc-500">메뉴 순서</h4>
        <Segmented
          id={`${idPrefix}-order`}
          value={order}
          onChange={setOrder}
          options={[
            { value: "random", label: <><Shuffle className="size-4" />접속할 때마다 랜덤</> },
            { value: "name", label: <><ArrowDownAZ className="size-4" />가나다순</> },
          ]}
        />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ 설정

type Section = "menu" | "user" | "general";

export function SettingsSheet({
  open,
  onClose,
  state,
  act,
  prefs,
  onChangeName,
}: {
  open: boolean;
  onClose: () => void;
  state: AppState;
  act: Act;
  prefs: Prefs;
  onChangeName: () => void;
}) {
  const [section, setSection] = useState<Section>("menu");
  return (
    <Sheet open={open} onClose={onClose} title="설정" tall scrollKey={section}>
      <div className="sticky top-0 z-10 -mx-5 mb-4 bg-white px-5 pb-2 dark:bg-zinc-900">
      <Segmented
        id="settings"
        value={section}
        onChange={setSection}
        options={[
          { value: "menu", label: <><Utensils className="size-4" />메뉴</> },
          { value: "user", label: <><UserRound className="size-4" />사용자</> },
          { value: "general", label: <><Settings2 className="size-4" />설정</> },
        ]}
      />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={section}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.15 }}
        >
          {section === "menu" && <MenuEditor state={state} act={act} />}
          {section === "user" && <UserEditor state={state} act={act} />}
          {section === "general" && (
            <div className="space-y-8">
              <Group icon={<Clock className="size-[18px]" />} title="투표 시간" note="모두에게 적용돼요">
                <RoundsEditor state={state} act={act} />
              </Group>
              <Group icon={<Palette className="size-[18px]" />} title="화면" note="이 기기에만 저장돼요">
                <ViewSettings state={state} prefs={prefs} onChangeName={onChangeName} />
              </Group>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </Sheet>
  );
}

const inputCls =
  "h-12 min-w-0 rounded-2xl bg-zinc-100 px-4 text-[17px] outline-none focus:ring-2 focus:ring-brand-400 dark:bg-zinc-800";
const addBtnCls =
  "grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-500 text-white disabled:bg-zinc-200 disabled:text-zinc-400 dark:disabled:bg-zinc-800";
const iconBtnCls =
  "grid size-9 place-items-center rounded-xl text-zinc-500 active:bg-zinc-100 disabled:opacity-30 dark:text-zinc-400 dark:active:bg-zinc-800";

function Group({ icon, title, note, children }: { icon: ReactNode; title: string; note: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-1.5 text-lg font-bold">
        {icon}
        {title}
        <span className="ml-auto text-xs font-medium text-zinc-400">{note}</span>
      </h3>
      {children}
    </section>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="mb-4 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">{children}</p>;
}

// ------------------------------------------------------------------ 시간

function RoundsEditor({ state, act }: { state: AppState; act: Act }) {
  const { confirm } = useUI();
  const [rows, setRows] = useState<RoundSetting[]>(state.rounds);
  useEffect(() => {
    setRows(state.rounds);
  }, [state.rounds]);
  const dirty = JSON.stringify(rows) !== JSON.stringify(state.rounds);

  const update = (i: number, patch: Partial<RoundSetting>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  const save = async () => {
    if (rows.length === 0 && !(await confirm({ title: "자동 초기화를 끌까요?", message: "회차가 없으면 투표가 자동으로 초기화되지 않아요." }))) return;
    await act("/api/settings/rounds", { rounds: rows.map((r) => ({ name: r.name.trim(), reset: r.reset })) }, "투표 시간을 저장했어요");
  };

  return (
    <div>
      <Hint>
        각 회차의 투표는 정한 시각(한국 시간)에 자동으로 초기화되고, 지난 투표는 저장되지 않아요.
        <br />
        지금은 <b className="text-zinc-800 dark:text-zinc-200">{state.round.name} 투표</b>
        {state.round.next_reset_label && ` · ${state.round.next_reset_label}에 초기화`}
      </Hint>
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {rows.map((r, i) => (
            <motion.div
              key={i}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex gap-2"
            >
              <input aria-label="회차 이름" className={cn(inputCls, "flex-1")} value={r.name} maxLength={20} placeholder="회차 이름" onChange={(e) => update(i, { name: e.target.value })} />
              <input aria-label="초기화 시각" type="time" className={cn(inputCls, "w-[9.5rem] shrink-0 px-3")} value={r.reset} onChange={(e) => update(i, { reset: e.target.value })} />
              <button aria-label="회차 삭제" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="grid size-12 shrink-0 place-items-center rounded-2xl text-zinc-400">
                <Trash2 className="size-5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <button
        onClick={() => setRows((r) => [...r, { name: "", reset: "" }])}
        className="mt-2 flex h-12 w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-zinc-200 font-semibold text-zinc-500 dark:border-zinc-700"
      >
        <Plus className="size-5" /> 회차 추가
      </button>
      <button
        disabled={!dirty}
        onClick={save}
        className="mt-5 w-full rounded-2xl bg-brand-500 py-3.5 font-bold text-white disabled:bg-zinc-200 disabled:text-zinc-400 dark:disabled:bg-zinc-800"
      >
        저장
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ 메뉴 · 카테고리

function MenuEditor({ state, act }: { state: AppState; act: Act }) {
  const { confirm, prompt, choose } = useUI();
  const [categoryId, setCategoryId] = useState(state.categories[0]?.id ?? 0);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const categories = state.categories;
  const index = Math.max(0, categories.findIndex((c) => c.id === categoryId));
  const category = categories[index];

  // 새로 만든 카테고리로 이동
  useEffect(() => {
    const made = pendingCategory && categories.find((c) => c.name === pendingCategory);
    if (made) {
      setCategoryId(made.id);
      setPendingCategory(null);
    }
  }, [categories, pendingCategory]);

  // 카테고리를 바꾸면 선택 모드·검색을 초기화
  useEffect(() => {
    setSelecting(false);
    setPicked(new Set());
    setText("");
  }, [categoryId]);

  // 사라진 메뉴는 선택에서 뺀다
  useEffect(() => {
    if (!category) return;
    const ids = new Set(category.menus.map((m) => m.id));
    setPicked((cur) => ([...cur].every((id) => ids.has(id)) ? cur : new Set([...cur].filter((id) => ids.has(id)))));
  }, [category]);

  const list = category
    ? category.menus.filter((m) => matches(m.name, text)).sort((a, b) => a.name.localeCompare(b.name, "ko"))
    : [];
  const pickedMenus = category ? category.menus.filter((m) => picked.has(m.id)) : [];

  // --- 카테고리
  const addCategory = async () => {
    const name = await prompt({ title: "새 카테고리", placeholder: "예: 카페, 야식", confirmText: "추가" });
    if (name && (await act("/api/categories", { name }, `'${name}' 카테고리를 만들었어요`))) setPendingCategory(name);
  };
  const renameCategory = async () => {
    if (!category) return;
    const name = await prompt({ title: "카테고리 이름 변경", initial: category.name, confirmText: "변경" });
    if (name && name !== category.name) await act("/api/categories/update", { id: category.id, name }, "이름을 바꿨어요");
  };
  const moveCategory = (offset: -1 | 1) => category && act("/api/categories/update", { id: category.id, move: offset });
  const deleteCategory = async () => {
    if (!category) return;
    const votes = category.menus.reduce((n, m) => n + m.votes, 0);
    const ok = await confirm({
      title: `'${category.name}' 카테고리를 삭제할까요?`,
      message:
        category.menus.length === 0
          ? undefined
          : `안에 있는 메뉴 ${category.menus.length}개도 함께 삭제돼요.${votes ? `\n(이번 투표 ${votes}표 포함)` : ""}\n메뉴를 남기려면 먼저 다른 카테고리로 옮겨 주세요.`,
      confirmText: "삭제",
      danger: true,
    });
    if (ok) await act("/api/categories/delete", { id: category.id }, "카테고리를 삭제했어요");
  };

  // --- 메뉴
  const addMenu = async (e: FormEvent) => {
    e.preventDefault();
    const name = text.trim();
    if (!name || !category) return;
    if (await act("/api/menus", { category_id: category.id, name }, `'${name}' 추가했어요`)) setText("");
  };
  const renameMenu = async (id: number, current: string) => {
    const name = await prompt({ title: "메뉴 이름 변경", initial: current, confirmText: "변경" });
    if (name && name !== current) await act("/api/menus/update", { id, name }, "이름을 바꿨어요");
  };
  const deleteMenus = async (ids: number[], label: string) => {
    const votes = category?.menus.filter((m) => ids.includes(m.id)).reduce((n, m) => n + m.votes, 0) ?? 0;
    const ok = await confirm({
      title: `${label} 삭제할까요?`,
      message: votes ? `이번 투표에서 이 메뉴에 들어간 ${votes}표도 함께 사라져요.` : undefined,
      confirmText: "삭제",
      danger: true,
    });
    if (ok && (await act("/api/menus/delete", { ids }, "삭제했어요"))) setPicked(new Set());
  };
  const moveMenus = async () => {
    const others = categories.filter((c) => c.id !== category?.id);
    if (others.length === 0) {
      if (await confirm({ title: "옮길 카테고리가 없어요", message: "새 카테고리를 먼저 만들까요?", confirmText: "만들기" })) addCategory();
      return;
    }
    const target = await choose({
      title: `${pickedMenus.length}개 메뉴를 어디로 옮길까요?`,
      message: "이번 투표의 표는 그대로 유지돼요.",
      options: others.map((c) => ({
        value: c,
        label: (
          <span className="flex w-full items-center justify-between">
            {c.name}
            <span className="text-sm font-medium text-zinc-400">{c.menus.length}개</span>
          </span>
        ),
      })),
    });
    if (target && (await act("/api/menus/move", { ids: [...picked], category_id: target.id }, `'${target.name}'(으)로 옮겼어요`))) {
      setPicked(new Set());
      setSelecting(false);
    }
  };

  const togglePick = (id: number) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className={cn(selecting && "pb-20")}>
      {/* 카테고리 칩 */}
      <div className="no-scrollbar -mx-5 mb-3 flex gap-1.5 overflow-x-auto px-5">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategoryId(c.id)}
            className={cn(
              "h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold",
              c.id === category?.id ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
            )}
          >
            {c.name} <span className="opacity-60">{c.menus.length}</span>
          </button>
        ))}
        <button
          onClick={addCategory}
          className="flex h-9 shrink-0 items-center gap-1 rounded-full border-2 border-dashed border-zinc-200 px-3 text-sm font-semibold text-zinc-500 dark:border-zinc-700"
        >
          <Plus className="size-4" /> 카테고리
        </button>
      </div>

      {!category ? (
        <div className="py-12 text-center text-sm text-zinc-500">
          카테고리가 없어요. 먼저 카테고리를 만들어 주세요.
        </div>
      ) : (
        <>
          {/* 카테고리 도구 */}
          <div className="mb-3 flex items-center justify-between rounded-2xl bg-zinc-50 py-1 pr-1 pl-4 dark:bg-zinc-800/50">
            <h3 className="truncate text-xl">{category.name}</h3>
            <div className="flex shrink-0">
              <button aria-label="카테고리를 앞으로" disabled={index === 0} onClick={() => moveCategory(-1)} className={iconBtnCls}>
                <ChevronLeft className="size-5" />
              </button>
              <button aria-label="카테고리를 뒤로" disabled={index === categories.length - 1} onClick={() => moveCategory(1)} className={iconBtnCls}>
                <ChevronRight className="size-5" />
              </button>
              <button aria-label="카테고리 이름 변경" onClick={renameCategory} className={iconBtnCls}>
                <Pencil className="size-[18px]" />
              </button>
              <button aria-label="카테고리 삭제" onClick={deleteCategory} className={cn(iconBtnCls, "active:text-rose-500")}>
                <Trash2 className="size-[18px]" />
              </button>
            </div>
          </div>

          {/* 메뉴 추가·검색 */}
          <form onSubmit={addMenu} className="mb-3 flex gap-2">
            <input className={cn(inputCls, "flex-1")} value={text} maxLength={20} onChange={(e) => setText(e.target.value)} placeholder={`${category.name}에 메뉴 추가 · 검색`} aria-label="메뉴 이름" />
            <button type="submit" aria-label="메뉴 추가" disabled={!text.trim()} className={addBtnCls}>
              <Plus className="size-6" />
            </button>
          </form>

          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-sm text-zinc-500">
              {selecting ? `${picked.size}개 선택됨` : `메뉴 ${list.length}개 · 이름을 누르면 수정`}
            </span>
            <div className="flex gap-1">
              {selecting && (
                <button
                  onClick={() => setPicked(list.every((m) => picked.has(m.id)) ? new Set() : new Set(list.map((m) => m.id)))}
                  className="h-8 rounded-full px-3 text-sm font-semibold text-zinc-600 dark:text-zinc-300"
                >
                  {list.length > 0 && list.every((m) => picked.has(m.id)) ? "전체 해제" : "전체"}
                </button>
              )}
              <button
                onClick={() => {
                  setSelecting((v) => !v);
                  setPicked(new Set());
                }}
                disabled={!selecting && list.length === 0}
                className={cn(
                  "flex h-8 items-center gap-1 rounded-full px-3 text-sm font-semibold disabled:opacity-40",
                  selecting ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
                )}
              >
                {selecting ? "완료" : <><ListChecks className="size-4" /> 선택해서 이동·삭제</>}
              </button>
            </div>
          </div>

          <EditableList
            items={list.map((m) => ({ id: m.id, label: m.name, sub: m.votes ? `${m.votes}표` : undefined }))}
            selecting={selecting}
            picked={picked}
            onPick={togglePick}
            onRename={(item) => renameMenu(item.id, item.label)}
            onRemove={(item) => deleteMenus([item.id], `'${item.label}'`)}
            empty={text ? "오른쪽 + 버튼으로 새 메뉴를 추가할 수 있어요" : "메뉴가 없어요"}
          />

          {/* 선택 모드 하단 바 */}
          <AnimatePresence>
            {selecting && (
              <motion.div
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 80, opacity: 0 }}
                className="sticky bottom-0 -mx-5 mt-3 flex gap-2 bg-gradient-to-t from-white from-70% to-transparent px-5 pt-4 pb-1 dark:from-zinc-900"
              >
                <button
                  disabled={picked.size === 0}
                  onClick={moveMenus}
                  className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-brand-500 font-bold text-white disabled:bg-zinc-200 disabled:text-zinc-400 dark:disabled:bg-zinc-800"
                >
                  <ArrowRightLeft className="size-[18px]" /> 다른 카테고리로 이동
                </button>
                <button
                  aria-label="선택한 메뉴 삭제"
                  disabled={picked.size === 0}
                  onClick={() => deleteMenus([...picked], `메뉴 ${picked.size}개를`)}
                  className="grid size-12 place-items-center rounded-2xl bg-rose-500 text-white disabled:bg-zinc-200 disabled:text-zinc-400 dark:disabled:bg-zinc-800"
                >
                  <Trash2 className="size-5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ 사용자

function UserEditor({ state, act }: { state: AppState; act: Act }) {
  const { confirm, prompt } = useUI();
  const [name, setName] = useState("");
  const list = state.users.filter((u) => matches(u.name, name));

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (await act("/api/users", { name: name.trim() }, `'${name.trim()}' 님을 추가했어요`)) setName("");
  };
  const rename = async (id: number, current: string) => {
    const next = await prompt({ title: "이름 변경", initial: current, confirmText: "변경" });
    if (next && next !== current) await act("/api/users/update", { id, name: next }, "이름을 바꿨어요");
  };
  const remove = async (id: number, userName: string) => {
    const ok = await confirm({ title: `'${userName}' 님을 삭제할까요?`, message: "이번 투표에 참여했다면 그 표도 함께 사라져요.", confirmText: "삭제", danger: true });
    if (ok) await act("/api/users/delete", { ids: [id] }, "삭제했어요");
  };

  return (
    <div>
      <form onSubmit={add} className="mb-3 flex gap-2">
        <input className={cn(inputCls, "flex-1")} value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="사용자 추가 · 검색" aria-label="사용자 이름" />
        <button type="submit" aria-label="사용자 추가" disabled={!name.trim()} className={addBtnCls}>
          <Plus className="size-6" />
        </button>
      </form>
      <p className="mb-2 px-1 text-sm text-zinc-500">{list.length}명 · 이름을 누르면 수정</p>
      <EditableList
        items={list.map((u) => ({ id: u.id, label: u.name, sub: u.id === state.me?.id ? "나" : undefined }))}
        onRename={(item) => rename(item.id, item.label)}
        onRemove={(item) => remove(item.id, item.label)}
        empty="오른쪽 + 버튼으로 새 사용자를 추가할 수 있어요"
      />
    </div>
  );
}

// ------------------------------------------------------------------ 공용 목록

type Item = { id: number; label: string; sub?: string };

function EditableList({
  items,
  selecting = false,
  picked,
  onPick,
  onRename,
  onRemove,
  empty,
}: {
  items: Item[];
  selecting?: boolean;
  picked?: Set<number>;
  onPick?: (id: number) => void;
  onRename: (item: Item) => void;
  onRemove: (item: Item) => void;
  empty: string;
}) {
  if (items.length === 0) return <p className="py-8 text-center text-sm text-zinc-400">{empty}</p>;
  return (
    <ul className="divide-y divide-zinc-100 rounded-2xl bg-zinc-50 dark:divide-zinc-800 dark:bg-zinc-800/50">
      <AnimatePresence initial={false}>
        {items.map((item) => {
          const on = picked?.has(item.id) ?? false;
          return (
            <motion.li key={item.id} layout exit={{ opacity: 0, height: 0 }} className="flex h-13 items-center overflow-hidden">
              <button
                onClick={() => (selecting ? onPick?.(item.id) : onRename(item))}
                className="flex h-full min-w-0 flex-1 items-center gap-3 pl-4 text-left"
              >
                {selecting && (
                  <span
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-md ring-2 transition-colors",
                      on ? "bg-brand-500 text-white ring-brand-500" : "ring-zinc-300 dark:ring-zinc-600",
                    )}
                  >
                    {on && <Check className="size-3.5" strokeWidth={3.5} />}
                  </span>
                )}
                <span className="truncate font-medium">{item.label}</span>
                {item.sub && <span className="shrink-0 text-xs font-semibold text-brand-500">{item.sub}</span>}
              </button>
              {!selecting && (
                <button
                  aria-label={`${item.label} 삭제`}
                  onClick={() => onRemove(item)}
                  className="mr-1.5 grid size-10 shrink-0 place-items-center rounded-xl text-zinc-400 active:bg-rose-50 active:text-rose-500 dark:active:bg-rose-500/10"
                >
                  <Trash2 className="size-[18px]" />
                </button>
              )}
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

// ------------------------------------------------------------------ 화면

function ViewSettings({ state, prefs, onChangeName }: { state: AppState; prefs: Prefs; onChangeName: () => void }) {
  return (
    <div className="space-y-5">
      <PrefPickers prefs={prefs} idPrefix="settings" />
      <div>
        <h4 className="mb-2 text-sm font-semibold text-zinc-500">이 기기의 사용자</h4>
        <button onClick={onChangeName} className="flex h-12 w-full items-center justify-between rounded-2xl bg-zinc-100 px-4 font-medium dark:bg-zinc-800">
          {state.me ? `${state.me.name} 님` : "선택 안 함"}
          <span className="text-sm font-semibold text-brand-500">변경</span>
        </button>
      </div>
      <p className="pt-4 text-center text-xs text-zinc-400">
        LearnData Lab MENU v{state.version} · by 순욱 ·{" "}
        <a className="underline" href="https://github.com/Soonwook34/ldlmenu" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </p>
    </div>
  );
}
