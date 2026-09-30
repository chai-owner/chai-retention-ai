import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { paginate, searchSuggestions } from "@/lib/section-search";

/** Search box + page state for one section. Changing the query resets to page 1. */
export function useSectionSearch<T>(items: T[], filter: (item: T, q: string) => boolean) {
  const [query, setQueryRaw] = useState("");
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => items.filter((i) => filter(i, query)), [items, filter, query]);
  const paged = paginate(filtered, page);
  const setQuery = (q: string) => {
    setQueryRaw(q);
    setPage(1);
  };
  return { query, setQuery, filtered, paged, setPage };
}

export function SectionSearch({
  value,
  onChange,
  candidates,
  placeholder = "Search by customer name",
}: {
  value: string;
  onChange: (v: string) => void;
  candidates: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrap = useRef<HTMLDivElement>(null);
  const suggestions = useMemo(() => searchSuggestions(value, candidates), [value, candidates]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (s: string) => {
    onChange(s);
    setOpen(false);
    setActive(-1);
  };
  const showList = open && suggestions.length > 0;

  return (
    <div ref={wrap} className="relative mt-4 w-full sm:max-w-sm">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        aria-label={placeholder}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(suggestions[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
        className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => pick("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {showList && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-popover py-1 text-sm text-popover-foreground shadow-md"
        >
          {suggestions.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              className={`cursor-pointer truncate px-3 py-1.5 ${i === active ? "bg-secondary" : "hover:bg-secondary"}`}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NoResults({ query }: { query: string }) {
  return <p className="mt-4 text-sm text-muted-foreground">No results for '{query}'</p>;
}

export function SectionPager({
  page,
  pageCount,
  start,
  end,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  start: number;
  end: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (total === 0) return null;
  const btn =
    "rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-50";
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">
        Showing {start}–{end} of {total}
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          <button className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>
            Previous
          </button>
          <button className={btn} disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
