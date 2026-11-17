import type { Theme } from "../lib/theme";
import { MoonIcon, SunIcon } from "./Icons";

type ThemeToggleProps = {
  theme: Theme;
  onToggle: () => void;
};

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      id="theme-toggle"
      className="theme-toggle"
      data-action="toggle-theme"
      data-theme-mode={theme}
      aria-pressed={theme === "dark"}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={onToggle}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
