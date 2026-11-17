import { useEffect, useRef, useState, type FormEvent } from "react";
import { MAX_TITLE_LENGTH } from "../lib/constants";
import { sanitizeTitle } from "../lib/tasks";

type EditableTitleProps = {
  title: string;
  ariaLabel: string;
  onSave: (title: string) => void;
  disabled?: boolean;
  disabledReason?: string;
};

export function EditableTitle({
  title,
  ariaLabel,
  onSave,
  disabled = false,
  disabledReason,
}: EditableTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  function startEditing() {
    if (disabled) return;
    setDraft(title);
    finishedRef.current = false;
    setEditing(true);
  }

  function commit() {
    if (finishedRef.current) return;
    finishedRef.current = true;

    const next = sanitizeTitle(draft);
    setEditing(false);

    if (next && next !== title) {
      onSave(next);
    } else {
      setDraft(title);
    }
  }

  function cancel() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setDraft(title);
    setEditing(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    commit();
  }

  if (editing && !disabled) {
    return (
      <form className="title-edit" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          className="title-input"
          value={draft}
          maxLength={MAX_TITLE_LENGTH}
          aria-label={ariaLabel}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
        />
      </form>
    );
  }

  if (disabled) {
    return (
      <span className="item__title" title={disabledReason}>
        {title}
      </span>
    );
  }

  return (
    <button
      type="button"
      className="item__title item__title--editable"
      title="Click to rename"
      aria-label={ariaLabel}
      onClick={startEditing}
    >
      {title}
    </button>
  );
}
