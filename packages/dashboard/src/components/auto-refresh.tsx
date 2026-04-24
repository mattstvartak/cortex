"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Polls the current route via `router.refresh()` on an interval so
 * pages built from React Server Components stay live without a full
 * page reload. Pairs with `export const dynamic = "force-dynamic"` on
 * the route — that's what makes `router.refresh()` actually re-fetch
 * data instead of returning cached HTML.
 *
 * Behavior:
 *   - Pauses when the tab is hidden so background tabs don't thrash
 *     the server.
 *   - Resumes immediately on focus with an eager refresh — matches
 *     the "flick back to the tab, see fresh data" instinct.
 *   - Exposes an optional label + next-refresh countdown through a
 *     render prop, for a status-bar affordance. Rendering UI is
 *     optional — most pages just drop <AutoRefresh /> anywhere.
 *
 * Drop it once per page. Multiple instances would stack intervals.
 */
export interface AutoRefreshProps {
  /** Poll interval in milliseconds. Default 15s — fast enough for
   *  "action items landed", slow enough not to hammer the MCP. */
  intervalMs?: number;
  /** When false, the component does nothing. Useful for wiring a
   *  user toggle without unmounting. */
  enabled?: boolean;
  /** Optional render prop for a status indicator (seconds to next
   *  refresh, paused badge, etc). */
  children?: (state: AutoRefreshState) => React.ReactNode;
}

export interface AutoRefreshState {
  enabled: boolean;
  visible: boolean;
  secondsUntilRefresh: number;
}

export function AutoRefresh({
  intervalMs = 15_000,
  enabled = true,
  children,
}: AutoRefreshProps): React.JSX.Element | null {
  const router = useRouter();
  const [visible, setVisible] = useState(
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(
    Math.ceil(intervalMs / 1000),
  );
  const lastRefreshRef = useRef<number>(Date.now());

  // Visibility tracking.
  useEffect(() => {
    const onVis = () => {
      const now = document.visibilityState === "visible";
      setVisible(now);
      if (now && enabled) {
        // Eager refresh on focus so the user sees fresh data
        // immediately, then the interval restarts.
        router.refresh();
        lastRefreshRef.current = Date.now();
        setSecondsUntilRefresh(Math.ceil(intervalMs / 1000));
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [enabled, intervalMs, router]);

  // Main polling loop.
  useEffect(() => {
    if (!enabled || !visible) return;
    const tick = setInterval(() => {
      router.refresh();
      lastRefreshRef.current = Date.now();
      setSecondsUntilRefresh(Math.ceil(intervalMs / 1000));
    }, intervalMs);
    return () => clearInterval(tick);
  }, [enabled, visible, intervalMs, router]);

  // Countdown display. Separate interval so the indicator ticks
  // every second without triggering actual refreshes.
  useEffect(() => {
    if (!children) return;
    const tick = setInterval(() => {
      const elapsed = Date.now() - lastRefreshRef.current;
      setSecondsUntilRefresh(
        Math.max(0, Math.ceil((intervalMs - elapsed) / 1000)),
      );
    }, 1000);
    return () => clearInterval(tick);
  }, [children, intervalMs]);

  if (children) {
    return <>{children({ enabled, visible, secondsUntilRefresh })}</>;
  }
  return null;
}
