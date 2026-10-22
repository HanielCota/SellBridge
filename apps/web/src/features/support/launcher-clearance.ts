/** The edges of a box on screen, as `getBoundingClientRect` gives them. */
export interface ScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** What a reseller can click on the page; the bubble must never sit over one. */
const CONTROL_SELECTOR = "a[href], button, input, select, textarea, [role='button']";

function hasSize(box: ScreenBox): boolean {
  return box.right > box.left && box.bottom > box.top;
}

function overlaps(first: ScreenBox, second: ScreenBox): boolean {
  return (
    first.left < second.right &&
    second.left < first.right &&
    first.top < second.bottom &&
    second.top < first.bottom
  );
}

/** Whether the bubble sits over any visible control; touching an edge is not covering. */
export function coversAnyControl(bubble: ScreenBox, controls: readonly ScreenBox[]): boolean {
  return controls.some((control) => hasSize(control) && overlaps(bubble, control));
}

function coversPageControl(bubble: HTMLElement, page: HTMLElement): boolean {
  const controls = Array.from(page.querySelectorAll(CONTROL_SELECTOR), (control) =>
    control.getBoundingClientRect(),
  );
  return coversAnyControl(bubble.getBoundingClientRect(), controls);
}

/**
 * Calls `onCovered` once the bubble sits over a control of the page, checking again whenever
 * the page or a container inside it scrolls (scroll does not bubble, so it is caught on the way
 * down), resizes or gets new content (a list that loads after the bubble). Returns
 * the cleanup. The expanded bubble covered "Próxima" and "Operar pedido" at the bottom of the
 * screen, so a tap meant for them opened support instead.
 */
export function watchCoveredControls(
  bubble: HTMLElement,
  page: HTMLElement,
  onCovered: () => void,
): () => void {
  let frame = 0;
  const check = () => {
    frame = 0;
    if (coversPageControl(bubble, page)) {
      onCovered();
    }
  };
  const schedule = () => {
    if (frame === 0) {
      frame = window.requestAnimationFrame(check);
    }
  };
  const mutations = new MutationObserver(schedule);
  mutations.observe(page, { childList: true, subtree: true });
  window.addEventListener("scroll", schedule, { capture: true, passive: true });
  window.addEventListener("resize", schedule);
  schedule();
  return () => {
    window.cancelAnimationFrame(frame);
    mutations.disconnect();
    window.removeEventListener("scroll", schedule, { capture: true });
    window.removeEventListener("resize", schedule);
  };
}
