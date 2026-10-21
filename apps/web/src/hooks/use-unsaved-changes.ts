import { useBlocker } from "@tanstack/react-router";
import { useRef } from "react";

/** Protect both in-app navigation and closing or reloading a dirty form. */
export function useUnsavedChanges(isDirty: boolean, hasUnsavedChanges = () => isDirty) {
  const discardConfirmed = useRef(false);
  useBlocker({
    disabled: !isDirty,
    enableBeforeUnload: hasUnsavedChanges,
    shouldBlockFn: () =>
      hasUnsavedChanges() && !discardConfirmed.current && !confirmDiscardChanges(),
  });

  return () => {
    if (!hasUnsavedChanges()) return true;
    discardConfirmed.current = confirmDiscardChanges();
    return discardConfirmed.current;
  };
}

function confirmDiscardChanges(): boolean {
  return window.confirm("Você tem alterações não salvas. Sair sem salvar?");
}
