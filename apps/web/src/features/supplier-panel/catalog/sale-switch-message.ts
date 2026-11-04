/** The toast after the supplier takes a product off sale or puts it back. */
export function saleSwitchMessage(result: { active: boolean; pausedTargets: number }): string {
  if (result.active) {
    return "Produto reativado";
  }
  if (result.pausedTargets <= 0) {
    return "Produto desativado";
  }
  const paused =
    result.pausedTargets === 1 ? "1 anúncio pausado" : `${result.pausedTargets} anúncios pausados`;
  return `Produto desativado · ${paused}`;
}
