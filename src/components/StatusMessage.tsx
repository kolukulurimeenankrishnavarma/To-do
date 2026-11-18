type StatusMessageProps = {
  id: string;
  kind: "success" | "error";
  text: string;
  link?: string;
  /** Base class name, e.g. `auth__message` or `team-invite-message`. */
  className: string;
  linkClassName?: string;
  linkId?: string;
  extraClassName?: string;
};

/** Shared inline feedback used by auth and team action panels. */
export function StatusMessage({
  id,
  kind,
  text,
  link,
  className,
  linkClassName = `${className}__link`,
  linkId,
  extraClassName,
}: StatusMessageProps) {
  const classes = [className, `${className}--${kind}`, extraClassName]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} id={id} role="status">
      <p>{text}</p>
      {link ? (
        <p className={linkClassName}>
          <a id={linkId} href={link}>
            {link}
          </a>
        </p>
      ) : null}
    </div>
  );
}
