import type { TaskSort } from "../types";

type TaskToolbarProps = {
  sort: TaskSort;
  onSortChange: (sort: TaskSort) => void;
};

const SORTS: { id: TaskSort; label: string }[] = [
  { id: "newest", label: "Newest first" },
  { id: "deadline", label: "Deadline soonest" },
  { id: "progress-desc", label: "Progress high to low" },
  { id: "progress-asc", label: "Progress low to high" },
  { id: "title", label: "Title A–Z" },
];

export function TaskToolbar({ sort, onSortChange }: TaskToolbarProps) {
  return (
    <div className="toolbar">
      <span className="toolbar__hint">Choose a view on the left.</span>
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
  );
}
