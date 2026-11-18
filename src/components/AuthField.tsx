import type { InputHTMLAttributes, ReactNode } from "react";

type AuthFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "className" | "prefix"
> & {
  id: string;
  label: string;
  warning?: string | null;
  /** Rendered before the input inside `.auth__mobile` when present. */
  prefix?: ReactNode;
};

/** One labelled auth input with its warning and matching ARIA attributes. */
export function AuthField({
  id,
  label,
  warning,
  prefix,
  ...inputProps
}: AuthFieldProps) {
  const warningId = `${id}-warning`;
  const input = (
    <input
      {...inputProps}
      id={id}
      aria-invalid={warning ? true : undefined}
      aria-describedby={warning ? warningId : undefined}
    />
  );

  return (
    <div className="auth__field">
      <label htmlFor={id}>{label}</label>
      {prefix ? <div className="auth__mobile">{prefix}{input}</div> : input}
      {warning ? (
        <span className="auth__warning" id={warningId} role="status">
          {warning}
        </span>
      ) : null}
    </div>
  );
}
