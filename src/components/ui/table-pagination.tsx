import { ChevronLeft, ChevronRight } from "lucide-react";
import { showingRange } from "@/lib/data-tables.functions";

interface Props {
  page: number;
  pageSize: number;
  total: number;
  /** Plural noun for the count label, e.g. "customers". */
  noun: string;
  onPageChange: (page: number) => void;
}

/** Previous/next controls plus a "Showing X–Y of Z" label. */
export function TablePagination({ page, pageSize, total, noun, onPageChange }: Props) {
  const { start, end, pageCount } = showingRange(page, pageSize, total);
  const current = Math.min(Math.max(1, page), Math.max(1, pageCount));

  if (total === 0) return null;

  const btn =
    "inline-flex items-center gap-1 rounded-[10px] border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">
        Showing <span className="tabular-nums">{start}</span>–<span className="tabular-nums">{end}</span> of{" "}
        <span className="tabular-nums">{total.toLocaleString()}</span> {noun}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={btn}
          disabled={current <= 1}
          onClick={() => onPageChange(current - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Previous
        </button>
        <span className="text-xs text-muted-foreground">
          Page <span className="tabular-nums">{current}</span> of{" "}
          <span className="tabular-nums">{Math.max(1, pageCount)}</span>
        </span>
        <button
          type="button"
          className={btn}
          disabled={current >= pageCount}
          onClick={() => onPageChange(current + 1)}
          aria-label="Next page"
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
