import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { COUNTRIES, type Country } from "../lib/countryCodes";
import { ChevronIcon } from "./Icons";

type CountryPickerProps = {
  value: Country;
  onChange: (country: Country) => void;
  buttonId?: string;
  searchId?: string;
  listId?: string;
  label?: string;
};

function scoreCountry(country: Country, query: string): number {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return 1;

  const digits = normalized.replace(/\D/g, "");
  const dialDigits = country.dial.replace(/\D/g, "");
  const name = country.name.toLowerCase();
  const code = country.code.toLowerCase();

  if (digits.length > 0 && country.dial === `+${digits}`) return 0;
  if (code === normalized) return 0;
  if (name === normalized) return 1;
  if (digits.length > 0 && country.dial.startsWith(`+${digits}`)) return 2;
  if (name.startsWith(normalized)) return 3;
  if (name.includes(normalized)) return 4;
  if (code.includes(normalized)) return 5;
  if (digits.length > 0 && dialDigits.includes(digits)) return 6;

  return -1;
}

export function CountryPicker({
  value,
  onChange,
  buttonId,
  searchId,
  listId,
  label = "Country code",
}: CountryPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    return COUNTRIES.map((country) => ({
      country,
      score: scoreCountry(country, query),
    }))
      .filter((entry) => entry.score >= 0)
      .sort(
        (a, b) =>
          a.score - b.score || a.country.name.localeCompare(b.country.name),
      )
      .map((entry) => entry.country);
  }, [query]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }

    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }

  function choose(country: Country) {
    onChange(country);
    setOpen(false);
    setQuery("");
  }

  const optionId = (index: number) => `${listId ?? "country"}-option-${index}`;
  const activeOptionIndex = Math.min(
    activeIndex,
    Math.max(0, results.length - 1),
  );
  const activeOption = results[activeOptionIndex];

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) =>
        results.length === 0 ? 0 : Math.min(results.length - 1, index + 1),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(0, results.length - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeOption) choose(activeOption);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="country-picker" ref={rootRef}>
      <button
        type="button"
        className="country-picker__trigger"
        id={buttonId}
        aria-label={`${label}. Currently ${value.name} ${value.dial}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`${value.name} (${value.dial})`}
        onClick={toggle}
      >
        <span className="country-picker__flag" aria-hidden="true">
          {value.flag}
        </span>
        <span className="country-picker__dial">{value.dial}</span>
        <ChevronIcon className="country-picker__chevron" />
      </button>

      {open ? (
        <div className="country-picker__popover">
          <input
            ref={searchRef}
            type="text"
            className="country-picker__search"
            id={searchId}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              activeOption ? optionId(activeOptionIndex) : undefined
            }
            aria-label="Search countries by name or dial code"
            autoComplete="off"
            spellCheck={false}
            placeholder="Type a country or code, e.g. 91"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleSearchKeyDown}
          />

          <ul
            className="country-picker__list"
            id={listId}
            role="listbox"
            aria-label={label}
          >
            {results.length === 0 ? (
              <li className="country-picker__empty">No countries match.</li>
            ) : (
              results.map((country, index) => (
                <li
                  key={country.code}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === activeOptionIndex}
                >
                  <button
                    type="button"
                    className={`country-option${
                      index === activeOptionIndex ? " country-option--active" : ""
                    }`}
                    tabIndex={-1}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(country)}
                  >
                    <span className="country-option__flag" aria-hidden="true">
                      {country.flag}
                    </span>
                    <span className="country-option__name">{country.name}</span>
                    <span className="country-option__dial">{country.dial}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
