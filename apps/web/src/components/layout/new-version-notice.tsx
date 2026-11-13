import { useOutdatedPage } from "@/features/app-version/use-outdated-page";

/**
 * A quiet button in the header once a deploy replaced this page's build. Reloading is the
 * person's choice: an automatic reload could throw away a form being filled in.
 */
export function NewVersionNotice() {
  const outdated = useOutdatedPage();
  if (!outdated) {
    return null;
  }
  return (
    <button
      type="button"
      // The phone hides the first words; the name keeps the whole text the computer shows.
      aria-label="Nova versão do SellBridge · Atualizar"
      onClick={() => window.location.reload()}
      className="inline-flex h-10 items-center gap-2 rounded-full border border-amber-400 bg-amber-100 px-3.5 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none dark:border-amber-500/40 dark:bg-amber-950/60 dark:text-amber-200 dark:hover:bg-amber-900/70"
    >
      <span
        aria-hidden="true"
        className="size-2 rounded-full bg-amber-400 shadow-[0_0_0_4px] shadow-amber-400/20"
      />
      {/* The space keeps "·" and "Atualizar" apart in the text axe compares with the name. */}
      <span className="hidden sm:inline">Nova versão do SellBridge ·</span>{" "}
      <span className="font-semibold text-amber-950 dark:text-white">Atualizar</span>
    </button>
  );
}
