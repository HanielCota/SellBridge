import { useEffect, useRef } from "react";
import { playNotificationSound, unlockNotificationSound } from "@/lib/notification-sound";
import type { AppNotification } from "./notification-presenter";

function newestTime(items: AppNotification[]): number {
  let newest = 0;
  for (const item of items) {
    newest = Math.max(newest, new Date(item.at).getTime());
  }
  return newest;
}

/**
 * Chimes when a poll brings a notification newer than any seen so far.
 * The first load only sets the baseline, so opening the app stays quiet.
 */
export function useNotificationChime(items: AppNotification[] | undefined) {
  const baseline = useRef<number | null>(null);

  useEffect(() => {
    window.addEventListener("pointerdown", unlockNotificationSound);
    window.addEventListener("keydown", unlockNotificationSound);
    return () => {
      window.removeEventListener("pointerdown", unlockNotificationSound);
      window.removeEventListener("keydown", unlockNotificationSound);
    };
  }, []);

  useEffect(() => {
    if (!items) {
      return;
    }
    const newest = newestTime(items);
    const previous = baseline.current;
    baseline.current = Math.max(previous ?? 0, newest);
    if (previous === null || newest <= previous) {
      return;
    }
    playNotificationSound();
  }, [items]);
}
