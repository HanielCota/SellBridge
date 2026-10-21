import { useEffect, useRef, useState } from "react";

const KEY_PREFIX = "sellbridge:ticket-draft:";
/** Long enough not to write on every key, short enough that a closed tab loses little. */
const SAVE_DELAY_MILLISECONDS = 600;

export type DraftState = "empty" | "saving" | "saved";

/** Storage can be blocked (private windows, strict settings): the draft is just a convenience. */
function readDraft(key: string): string {
  try {
    return localStorage.getItem(KEY_PREFIX + key) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(key: string, body: string): void {
  try {
    if (body.trim() === "") {
      localStorage.removeItem(KEY_PREFIX + key);
      return;
    }
    localStorage.setItem(KEY_PREFIX + key, body);
  } catch {
    // Nothing to do: the text is still on screen.
  }
}

/**
 * The reply being written, kept in this browser per ticket so leaving the page does not lose
 * it. Starts empty and loads after mount, so the server render and the first client render match.
 */
export function useReplyDraft(key: string | undefined) {
  const [body, setBody] = useState("");
  const [state, setState] = useState<DraftState>("empty");
  const loadedKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!key || loadedKey.current === key) {
      return;
    }
    loadedKey.current = key;
    const saved = readDraft(key);
    setBody(saved);
    setState(saved ? "saved" : "empty");
  }, [key]);

  useEffect(() => {
    const timer = setTimeout(() => {
      // Until the saved draft is loaded, the empty start must not overwrite it.
      if (!key || loadedKey.current !== key) {
        return;
      }
      writeDraft(key, body);
      setState(body.trim() ? "saved" : "empty");
    }, SAVE_DELAY_MILLISECONDS);
    return () => clearTimeout(timer);
  }, [key, body]);

  function update(next: string) {
    setBody(next);
    if (key) {
      setState(next.trim() ? "saving" : "empty");
    }
  }

  function clear() {
    setBody("");
    setState("empty");
    if (key) {
      writeDraft(key, "");
    }
  }

  return { body, setBody: update, clear, state };
}
