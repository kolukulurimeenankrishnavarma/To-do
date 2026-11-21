import type { TaskSort } from "../types";

type TaskToolbarProps = {
  sort: TaskSort;
  onSortChange: (sort: TaskSort) => void;
  bestFitAvailable?: boolean;
  bestFit?: boolean;
  onToggleBestFit?: () => void;
};

const SORTS: { id: TaskSort; label: string }[] = [
  { id: "newest", label: "Newest first" },
  { id: "deadline", label: "Deadline soonest" },
  { id: "progress-desc", label: "Progress high to low" },
  { id: "progress-asc", label: "Progress low to high" },
  { id: "title", label: "Title A–Z" },
];

export function TaskToolbar({
  sort,
  onSortChange,
  bestFitAvailable = false,
  bestFit = false,
  onToggleBestFit,
}: TaskToolbarProps) {
  return (
    <>
      {bestFitAvailable && onToggleBestFit ? (
        <div className="bestfit-strip">
          <span className="bestfit-strip__text">
            {bestFit
              ? `Best-fit order is on. Saved sort: ${
                  SORTS.find((item) => item.id === sort)?.label ?? sort
                }.`
              : "Reorder these tasks to match today's check-in."}
          </span>
          <button
            className="btn btn--ghost"
            type="button"
            id="best-fit-toggle"
            aria-pressed={bestFit}
            onClick={onToggleBestFit}
          >
            {bestFit ? "Back to saved sort" : "Use best-fit order"}
          </button>
        </div>
      ) : null}
      <div className="toolbar">
        <span className="toolbar__hint toolbar__hint--wide">
          Choose a view on the left.
        </span>
        <span className="toolbar__hint toolbar__hint--narrow">
          Choose a view above.
        </span>
        <label className="sort">
          <span className="sort__label">Sort</span>
          <select
            className="sort__select"
            value={sort}
            onChange={(event) => onSortChange(event.target.value as TaskSort)}
          >
            {SORTS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}
