import type { TaskSort } from "../types";

type TaskToolbarProps = {
  sort: TaskSort;
  onSortChange: (sort: TaskSort) => void;
  bestFitActive: boolean;
  onClearBestFit: () => void;
  savedSortLabel: string;
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
  bestFitActive,
  onClearBestFit,
  savedSortLabel,
}: TaskToolbarProps) {
  return (
    <>
      {bestFitActive ? (
        <div className="best-fit-strip" id="best-fit-strip" role="status">
          <span>Sorted by best fit for your energy</span>
          <button
            className="best-fit-strip__back"
            type="button"
            onClick={onClearBestFit}
          >
            Back to my sort ({savedSortLabel})
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
