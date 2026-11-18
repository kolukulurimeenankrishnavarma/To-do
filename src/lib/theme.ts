import { safeLocalStorage } from "./storage";

export type Theme = "light" | "dark";

const THEME_KEY = "taskly.theme";

export function readStoredTheme(): Theme | null {
  const storage = safeLocalStorage();
  if (!storage) return null;

  try {
    const value = storage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function rememberTheme(theme: Theme): void {
  const storage = safeLocalStorage();
  if (!storage) return;

  try {
    storage.setItem(THEME_KEY, theme);
  } catch {
    // The applied theme still works for this page.
  }
}

export function systemTheme(): Theme {
  try {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
  } catch {
    // Fall through to light mode.
  }
  return "light";
}

export function initialTheme(): Theme {
  if (typeof document !== "undefined") {
    const current = document.documentElement.dataset.theme;
    if (current === "light" || current === "dark") return current;
  }
  return readStoredTheme() ?? systemTheme();
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}

/**
 * Follow operating-system theme changes until the person picks a mode
 * explicitly. Once a choice is stored, the toggle stays authoritative.
 */
export function watchSystemTheme(onChange: (theme: Theme) => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => {};
  }

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const listener = (event: MediaQueryListEvent) => {
    if (readStoredTheme() === null) {
      onChange(event.matches ? "dark" : "light");
    }
  };

  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
