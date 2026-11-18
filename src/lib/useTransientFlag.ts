import { useCallback, useEffect, useRef, useState } from "react";

type TransientFlagOptions = {
  /**
   * Flash animations restart from the off state on the following frame so the
   * CSS animation replays. Plain feedback flags turn on immediately instead.
   */
  restartOnFrame?: boolean;
};

/**
 * A boolean that turns on when triggered and turns itself off after `duration`
 * milliseconds. Triggering again restarts the delay, and pending timers are
 * cleared when the component unmounts.
 */
export function useTransientFlag(
  duration: number,
  { restartOnFrame = true }: TransientFlagOptions = {},
): [boolean, () => void] {
  const [active, setActive] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
      if (frame.current !== undefined) window.cancelAnimationFrame(frame.current);
    };
  }, []);

  const trigger = useCallback(() => {
    if (restartOnFrame) {
      setActive(false);
      if (frame.current !== undefined) window.cancelAnimationFrame(frame.current);
      frame.current = window.requestAnimationFrame(() => {
        frame.current = undefined;
        setActive(true);
      });
    } else {
      setActive(true);
    }

    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      setActive(false);
    }, duration);
  }, [duration, restartOnFrame]);

  return [active, trigger];
}
