import { useEffect, useId, useRef, type KeyboardEvent, type ComponentProps } from "react";

import {
  DEFAULT_SUPPORT_POSITION,
  readSupportPosition,
  saveSupportPosition,
  type SupportPosition,
} from "./support-position-storage";

const MARGIN_IN_PX = 16;
/** A pointer has to travel this far before a press counts as a drag rather than a tap. */
const DRAG_THRESHOLD_IN_PX = 5;
const KEY_STEP_IN_PX = 16;
const KEY_STEP_LARGE_IN_PX = 48;
const DIRECTIONS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

function movementBounds(button: HTMLButtonElement) {
  const workspace = button.closest("[data-support-workspace]");
  const rect = workspace?.getBoundingClientRect();
  const viewport = document.documentElement;
  return {
    left: Math.max(0, rect?.left ?? 0) + MARGIN_IN_PX,
    right:
      Math.min(viewport.clientWidth, rect?.right ?? viewport.clientWidth) -
      button.offsetWidth -
      MARGIN_IN_PX,
    top: MARGIN_IN_PX,
    bottom: viewport.clientHeight - button.offsetHeight - MARGIN_IN_PX,
    rtl: getComputedStyle(button).direction === "rtl",
  };
}

function fraction(position: number, min: number, max: number): number {
  return max > min ? Math.min(1, Math.max(0, (position - min) / (max - min))) : 1;
}

interface Drag {
  id: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
}

function place(button: HTMLButtonElement, position: SupportPosition) {
  const { left, right, top, bottom, rtl } = movementBounds(button);
  const horizontal = rtl ? 1 - position.inline : position.inline;
  Object.assign(button.style, {
    left: `${left + (right - left) * horizontal}px`,
    top: `${top + (bottom - top) * position.vertical}px`,
    right: "auto",
    bottom: "auto",
  });
  button.setAttribute("data-placed", "");
}

function useSupportDrag(
  move: (button: HTMLButtonElement, left: number, top: number) => void,
  onDropped: () => void,
) {
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  function stopDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    event.currentTarget.removeAttribute("data-dragging");
    // Only a real drag moved it; a tap leaves the saved spot alone.
    if (suppressClick.current) onDropped();
  }
  return {
    onPointerDown(event) {
      if (!event.isPrimary || event.button !== 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      drag.current = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };
      suppressClick.current = false;
      // Touch already captures its target. Leave taps on the button's normal click path.
      if (event.pointerType === "mouse") event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event) {
      const active = drag.current;
      if (active === null || active.id !== event.pointerId) return;
      const distance = Math.hypot(event.clientX - active.startX, event.clientY - active.startY);
      if (!suppressClick.current && distance < DRAG_THRESHOLD_IN_PX) return;
      suppressClick.current = true;
      event.currentTarget.setAttribute("data-dragging", "");
      move(event.currentTarget, event.clientX - active.offsetX, event.clientY - active.offsetY);
    },
    onPointerUp: stopDrag,
    onPointerCancel: stopDrag,
    onLostPointerCapture: stopDrag,
    onClick(event) {
      if (!suppressClick.current || event.detail === 0) return;
      suppressClick.current = false;
      event.preventDefault();
    },
  } satisfies Pick<
    ComponentProps<"button">,
    | "onPointerDown"
    | "onPointerMove"
    | "onPointerUp"
    | "onPointerCancel"
    | "onLostPointerCapture"
    | "onClick"
  >;
}

export function useSupportPosition() {
  const instructions = useId();
  const ref = useRef<HTMLButtonElement>(null);
  // Read after mount: storage does not exist on the server render.
  const position = useRef<SupportPosition>(DEFAULT_SUPPORT_POSITION);

  function move(button: HTMLButtonElement, nextLeft: number, nextTop: number) {
    const { left, right, top, bottom, rtl } = movementBounds(button);
    const horizontal = fraction(nextLeft, left, right);
    position.current = {
      inline: rtl ? 1 - horizontal : horizontal,
      vertical: fraction(nextTop, top, bottom),
    };
    place(button, position.current);
  }
  const dragEvents = useSupportDrag(move, () => saveSupportPosition(position.current));

  useEffect(() => {
    const button = ref.current;
    if (button === null) return undefined;
    position.current = readSupportPosition();
    const update = () => place(button, position.current);
    const observer = new ResizeObserver(update);
    const workspace = button.closest("[data-support-workspace]");
    if (workspace !== null) observer.observe(workspace);
    const direction = new MutationObserver(update);
    direction.observe(document.documentElement, { attributeFilter: ["dir"] });
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      direction.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const button = event.currentTarget;
    if (event.key === "Home") {
      event.preventDefault();
      position.current = DEFAULT_SUPPORT_POSITION;
      place(button, position.current);
      saveSupportPosition(position.current);
      return;
    }
    const offset = DIRECTIONS[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    const step = event.shiftKey ? KEY_STEP_LARGE_IN_PX : KEY_STEP_IN_PX;
    const rect = button.getBoundingClientRect();
    move(button, rect.left + offset[0] * step, rect.top + offset[1] * step);
    saveSupportPosition(position.current);
  }
  return { instructions, buttonProps: { ref, draggable: false, ...dragEvents, onKeyDown } };
}
