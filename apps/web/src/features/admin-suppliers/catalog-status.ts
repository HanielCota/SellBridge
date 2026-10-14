/** "1 anúncio pausado", "3 anúncios pausados"; null when nothing was paused. */
export function pausedListingsLabel(pausedTargets: number): string | null {
  if (pausedTargets <= 0) {
    return null;
  }
  return pausedTargets === 1 ? "1 anúncio pausado" : `${pausedTargets} anúncios pausados`;
}

/** The toast after switching a product or supplier on or off, with the listings it paused. */
export function catalogStatusMessage(
  subject: "Produto" | "Fornecedor",
  result: { active: boolean; pausedTargets: number },
): string {
  const status = `${subject} ${result.active ? "ativado" : "desativado"}`;
  const paused = pausedListingsLabel(result.pausedTargets);
  return paused === null ? status : `${status} · ${paused}`;
}
