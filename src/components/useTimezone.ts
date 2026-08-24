import { useSyncExternalStore } from "react";

/**
 * The browser's IANA timezone. Read straight from the browser rather than
 * synced into state: the server renders "UTC" and this corrects on hydration.
 */
export function useTimezone(): string {
  return useSyncExternalStore(
    () => () => {},
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    () => "UTC",
  );
}
