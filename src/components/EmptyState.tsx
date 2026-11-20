type EmptyStateProps = {
  icon: string;
  title: string;
  text: string;
  filtered?: boolean;
  actionLabel?: string;
  onAction?: () => void;
};

/** Shared empty-list message with an optional recovery action. */
export function EmptyState({
  icon,
  title,
  text,
  filtered = false,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className={filtered ? "empty empty--filtered" : "empty"}>
      <div className="empty__icon" aria-hidden="true">
        {icon}
      </div>
      <p className="empty__title">{title}</p>
      <p className="empty__text">{text}</p>
      {actionLabel && onAction ? (
        <button className="link-btn" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
