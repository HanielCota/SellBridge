import { useNavigate } from "@tanstack/react-router";
import type { MouseEvent } from "react";

/** A click the browser should keep: a new tab or window (Ctrl, Cmd, Shift, middle button). */
export function opensElsewhere(
  event: Pick<MouseEvent, "button" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">,
) {
  return event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
}

/**
 * Click handler for a plain `<a href>` built from a path string: it moves inside the app
 * instead of reloading the whole document, and leaves new-tab clicks to the browser.
 */
export function useInAppLinkClick() {
  const navigate = useNavigate();
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (opensElsewhere(event)) {
      return;
    }
    event.preventDefault();
    void navigate({ href: event.currentTarget.getAttribute("href") ?? "/" });
  };
}
