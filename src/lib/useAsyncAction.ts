import { useCallback, useState } from "react";

/**
 * Tracks one in-flight action. The `busy` guard has the same semantics as the
 * original local state checks: calls made while busy are ignored.
 */
export function useAsyncAction() {
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
      if (busy) return undefined;
      setBusy(true);
      try {
        return await action();
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  return { busy, run } as const;
}
