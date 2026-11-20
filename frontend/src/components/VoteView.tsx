import { memo, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDownAZ, Check, Search, Shuffle, X } from "lucide-react";
import type { MenuOrder } from "../hooks";
import type { Category, Menu } from "../types";
import { cn, matches } from "../utils";

export const ALL = 0;

/** 검색창 + 카테고리 필터 (상단 고정 영역에 들어간다) */
export function VoteFilters({
  categories,
  query,
  setQuery,
  category,
  setCategory,
  onFocusChange,
}: {
  categories: Category[];
  query: string;
  setQuery: (q: string) => void;
  category: number;
  setCategory: (id: number) => void;
  onFocusChange: (focused: boolean) => void;
}) {
  const chips = [{ id: ALL, name: "전체", count: categories.reduce((n, c) => n + c.menus.length, 0) }].concat(
    categories.map((c) => ({ id: c.id, name: c.name, count: c.menus.length })),
  );
  return (
    <div className="space-y-2.5 pt-2.5">
      <label className="flex h-11 items-center gap-2 rounded-2xl bg-white px-3.5 ring-1 ring-zinc-200 focus-within:ring-2 focus-within:ring-brand-400 dark:bg-zinc-900 dark:ring-zinc-800">
        <Search className="size-[18px] shrink-0 text-zinc-400" />
        <input
          type="search"
          enterKeyHint="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
          placeholder="메뉴 검색 (초성도 돼요: ㄱㅂ)"
          className="min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-zinc-400 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button aria-label="검색어 지우기" onClick={() => setQuery("")} className="text-zinc-400">
            <X className="size-[18px]" />
          </button>
        )}
      </label>
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
        {chips.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={cn(
              "relative h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold transition-colors",
              category === c.id ? "text-white dark:text-zinc-900" : "bg-white text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800",
            )}
          >
            {category === c.id && (
              <motion.span
                layoutId="category-pill"
                className="absolute inset-0 rounded-full bg-zinc-900 dark:bg-white"
                transition={{ type: "spring", damping: 30, stiffness: 400 }}
              />
            )}
            <span className="relative">
              {c.name} <span className="opacity-60">{c.count}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

const MenuTile = memo(function MenuTile({
  menu,
  selected,
  onToggle,
}: {
  menu: Menu;
  selected: boolean;
  onToggle: (id: number) => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.93 }}
      transition={{ type: "spring", damping: 20, stiffness: 500 }}
      aria-pressed={selected}
      onClick={() => onToggle(menu.id)}
      className={cn(
        "relative flex min-h-14 items-center justify-center rounded-2xl px-2 py-2 text-[17px] leading-tight font-semibold break-keep [overflow-wrap:anywhere] transition-colors duration-150",
        selected
          ? "bg-brand-500 text-white shadow-lg shadow-brand-500/30"
          : "bg-white text-zinc-800 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-800",
      )}
    >
      <span className="line-clamp-2">{menu.name}</span>
      <AnimatePresence>
        {selected && (
          <motion.span
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0 }}
            transition={{ type: "spring", damping: 12, stiffness: 400 }}
            className="absolute top-1.5 left-1.5 grid size-4 place-items-center rounded-full bg-white text-brand-500"
          >
            <Check className="size-3" strokeWidth={3.5} />
          </motion.span>
        )}
      </AnimatePresence>
      {menu.votes > 0 && (
        <motion.span
          key={menu.votes}
          initial={{ scale: 1.6 }}
          animate={{ scale: 1 }}
          title={menu.voters.join(", ")}
          className={cn(
            "absolute -top-2 -right-1.5 grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs tabular-nums ring-2",
            selected
              ? "bg-white text-brand-600 ring-brand-500"
              : "bg-brand-500 text-white ring-zinc-50 dark:ring-zinc-950",
          )}
        >
          {menu.votes}
        </motion.span>
      )}
    </motion.button>
  );
});

/**
 * 카테고리별 메뉴 그리드.
 * 순서는 개인 설정: 랜덤(자리 편향을 줄이기 위해 페이지를 열 때마다 섞되 보는 동안은 고정) 또는 가나다순.
 */
export function MenuGrid({
  categories,
  query,
  category,
  selection,
  onToggle,
  onSelectMany,
  order,
  setOrder,
}: {
  categories: Category[];
  query: string;
  category: number;
  selection: Set<number>;
  onToggle: (id: number) => void;
  onSelectMany: (ids: number[], select: boolean) => void;
  order: MenuOrder;
  setOrder: (o: MenuOrder) => void;
}) {
  const shuffleKey = useRef(new Map<number, number>());
  const sections = useMemo(() => {
    const rank = (id: number) => {
      if (!shuffleKey.current.has(id)) shuffleKey.current.set(id, Math.random());
      return shuffleKey.current.get(id)!;
    };
    return categories
      .filter((c) => category === ALL || c.id === category)
      .map((c) => ({
        ...c,
        menus: c.menus
          .filter((m) => matches(m.name, query))
          .sort(order === "name" ? (a, b) => a.name.localeCompare(b.name, "ko") : (a, b) => rank(a.id) - rank(b.id)),
      }))
      .filter((c) => c.menus.length > 0);
  }, [categories, query, category, order]);

  if (sections.length === 0) {
    return (
      <div className="py-16 text-center text-zinc-500">
        <div className="mb-2 text-4xl">🔍</div>
        {query ? `'${query}'에 맞는 메뉴가 없어요` : "메뉴가 없어요"}
      </div>
    );
  }

  const visibleIds = sections.flatMap((c) => c.menus.map((m) => m.id));
  const allSelected = visibleIds.every((id) => selection.has(id));
  const scope = query ? "검색 결과" : category === ALL ? "메뉴" : categories.find((c) => c.id === category)?.name;

  return (
    <div className="space-y-5 pt-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          {scope} {visibleIds.length}개
        </span>
        <div className="flex gap-1.5">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setOrder(order === "random" ? "name" : "random")}
          aria-label={`메뉴 순서: ${order === "random" ? "랜덤" : "가나다순"} (눌러서 바꾸기)`}
          className="flex h-8 items-center gap-1 rounded-full bg-white px-3 text-sm font-semibold text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800"
        >
          {order === "random" ? <Shuffle className="size-4" /> : <ArrowDownAZ className="size-4" />}
          {order === "random" ? "랜덤" : "가나다"}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => onSelectMany(visibleIds, !allSelected)}
          className={cn(
            "flex h-8 items-center gap-1 rounded-full px-3 text-sm font-semibold",
            allSelected
              ? "bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
              : "bg-white text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800",
          )}
        >
          <Check className="size-4" strokeWidth={allSelected ? 3 : 2} />
          {allSelected ? "전체 해제" : "전체 선택"}
        </motion.button>
        </div>
      </div>
      {sections.map((c) => (
        <section key={c.id}>
          {(category === ALL || query) && (
            <h3 className="mb-2.5 flex items-baseline gap-2 px-1 text-lg font-bold">
              {c.name}
              <span className="text-sm font-medium text-zinc-400">{c.menus.length}</span>
            </h3>
          )}
          <div className="grid grid-cols-3 gap-2">
            {c.menus.map((m) => (
              <MenuTile key={m.id} menu={m} selected={selection.has(m.id)} onToggle={onToggle} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
