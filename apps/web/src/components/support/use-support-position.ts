import { useEffect, useId, useRef, type KeyboardEvent, type ComponentProps } from "react";

const MARGIN = 16;
const DIRECTIONS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

function movementBounds(button: HTMLAnchorElement) {
  const workspace = button.closest("[data-support-workspace]");
  const rect = workspace?.getBoundingClientRect();
  const viewport = document.documentElement;
  return {
    left: Math.max(0, rect?.left ?? 0) + MARGIN,
    right:
      Math.min(viewport.clientWidth, rect?.right ?? viewport.clientWidth) -
      button.offsetWidth -
      MARGIN,
    top: MARGIN,
    bottom: viewport.clientHeight - button.offsetHeight - MARGIN,
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

interface Position {
  inline: number;
  vertical: number;
}

function place(button: HTMLAnchorElement, position: Position) {
  const { left, right, top, bottom, rtl } = movementBounds(button);
  const horizontal = rtl ? 1 - position.inline : position.inline;
  Object.assign(button.style, {
    left: `${left + (right - left) * horizontal}px`,
    top: `${top + (bottom - top) * position.vertical}px`,
    right: "auto",
    bottom: "auto",
  });
}

function useSupportDrag(move: (button: HTMLAnchorElement, left: number, top: number) => void) {
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  function stopDrag(event: React.PointerEvent<HTMLAnchorElement>) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    event.currentTarget.removeAttribute("data-dragging");
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
      // Touch already captures its target. Leave taps on the anchor's normal click path.
      if (event.pointerType === "mouse") event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event) {
      const active = drag.current;
      if (!active || active.id !== event.pointerId) return;
      const distance = Math.hypot(event.clientX - active.startX, event.clientY - active.startY);
      if (!suppressClick.current && distance < 5) return;
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
    ComponentProps<"a">,
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
  const ref = useRef<HTMLAnchorElement>(null);
  const position = useRef({ inline: 1, vertical: 1 });

  function move(button: HTMLAnchorElement, nextLeft: number, nextTop: number) {
    const { left, right, top, bottom, rtl } = movementBounds(button);
    const horizontal = fraction(nextLeft, left, right);
    position.current = {
      inline: rtl ? 1 - horizontal : horizontal,
      vertical: fraction(nextTop, top, bottom),
    };
    place(button, position.current);
  }
  const dragEvents = useSupportDrag(move);

  useEffect(() => {
    const button = ref.current;
    if (!button) return undefined;
    const update = () => place(button, position.current);
    const observer = new ResizeObserver(update);
    const workspace = button.closest("[data-support-workspace]");
    if (workspace) observer.observe(workspace);
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

  function onKeyDown(event: KeyboardEvent<HTMLAnchorElement>) {
    const button = event.currentTarget;
    if (event.key === "Home") {
      event.preventDefault();
      position.current = { inline: 1, vertical: 1 };
      place(button, position.current);
      return;
    }
    const offset = DIRECTIONS[event.key];
    if (!offset) return;
    event.preventDefault();
    const step = event.shiftKey ? 48 : 16;
    const rect = button.getBoundingClientRect();
    move(button, rect.left + offset[0] * step, rect.top + offset[1] * step);
  }
  return { instructions, linkProps: { ref, draggable: false, ...dragEvents, onKeyDown } };
}
