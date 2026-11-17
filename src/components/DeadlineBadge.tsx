import { deadlineInfo, fullTimestamp } from "../lib/date";

type DeadlineBadgeProps = {
  deadline: number;
  completedAt?: number | null;
  now: number;
};

export function DeadlineBadge({
  deadline,
  completedAt = null,
  now,
}: DeadlineBadgeProps) {
  const info = deadlineInfo(deadline, completedAt, now);

  return (
    <span className={`deadline ${info.className}`} title={`Due ${fullTimestamp(deadline)}`}>
      {info.text}
    </span>
  );
}
