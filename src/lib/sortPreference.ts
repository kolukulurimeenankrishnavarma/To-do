import { SORT_KEY } from "./constants";
import type { TaskSort } from "../types";

const VALID_SORTS: TaskSort[] = [
  "newest",
  "deadline",
  "progress-desc",
  "progress-asc",
  "title",
];

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredSort(): TaskSort | null {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const value = storage.getItem(SORT_KEY);
    return VALID_SORTS.find((sort) => sort === value) ?? null;
  } catch {
    return null;
  }
}

export function rememberSort(sort: TaskSort): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(SORT_KEY, sort);
  } catch {
    // Sorting still works for this page even if storage is unavailable.
  }
}
