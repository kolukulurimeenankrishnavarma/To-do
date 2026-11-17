import { useEffect, useState, type RefObject } from "react";

export type PopoverPlacement = {
  side: "down" | "up";
  maxHeight: number;
};

/**
 * Keep a popover inside the viewport: place it on the roomier side of its
 * anchor and cap its height so short screens scroll inside the panel instead
 * of pushing controls off-screen. Matters most on landscape phones and at
 * high zoom levels.
 */
export function usePopoverPlacement(
  active: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  preferredHeight = 300,
): PopoverPlacement {
  const [placement, setPlacement] = useState<PopoverPlacement>({
    side: "down",
    maxHeight: preferredHeight,
  });

  useEffect(() => {
    if (!active) return;

    function update() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 18;
      const above = rect.top - 18;
      const side: PopoverPlacement["side"] =
        below >= Math.min(preferredHeight, 260) || below >= above
          ? "down"
          : "up";
      const available = side === "down" ? below : above;

      setPlacement({
        side,
        maxHeight: Math.max(96, Math.min(preferredHeight, available)),
      });
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [active, anchorRef, preferredHeight]);

  return placement;
}
