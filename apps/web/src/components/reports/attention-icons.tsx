/**
 * The marks of the "Precisa de você" panel. One family: a 24px grid, a 1.6 outline in
 * `currentColor`, the body washed at 18% and one solid mark that carries the meaning. Each part
 * tagged `glyph` plays its own motion inside a hovered link (see `.glyph` in styles.css); parts
 * tagged `glyph-mark` are the ones that only fade in under reduced motion.
 */

interface IconProps {
  className?: string;
}

const OUTLINE = {
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const WASH = { fill: "currentColor", fillOpacity: 0.18 } as const;

/** A storefront with a pause on its door: the store sags and the pause blinks, sales stopped. */
export function StorePausedIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g className="glyph glyph-dip" {...OUTLINE}>
        <path
          d="M4.5 4h15l1.5 4.5a2.5 2.5 0 0 1-4.5 1.5 2.5 2.5 0 0 1-4.5 0 2.5 2.5 0 0 1-4.5 0A2.5 2.5 0 0 1 3 8.5z"
          {...WASH}
        />
        <path d="M5 11.5V20h14v-8.5" />
      </g>
      <g className="glyph glyph-mark glyph-blink" fill="currentColor">
        <rect x="9.6" y="13.5" width="1.8" height="5" rx="0.6" />
        <rect x="12.6" y="13.5" width="1.8" height="5" rx="0.6" />
      </g>
    </svg>
  );
}

/** A price tag holding a "!": it shakes a "no" and the alert drops in. */
export function ListingAlertIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g className="glyph glyph-shake" {...OUTLINE}>
        <path d="M3 12V5a2 2 0 0 1 2-2h7l9 9a2 2 0 0 1 0 2.8l-6.2 6.2a2 2 0 0 1-2.8 0z" {...WASH} />
        <circle cx="7.5" cy="7.5" r="1.3" />
      </g>
      <g className="glyph glyph-mark glyph-drop">
        <path d="M13.2 9.2v4.3" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
        <circle cx="13.2" cy="16.6" r="1.25" fill="currentColor" />
      </g>
    </svg>
  );
}

/** A support headset: it rings, then its microphone lights up. Someone from the team answered. */
export function SupportHeadsetIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g className="glyph glyph-ring" {...OUTLINE}>
        <path d="M4.5 13v-1.5a7.5 7.5 0 0 1 15 0V13" />
        <rect x="3" y="12" width="4.5" height="6.5" rx="2" {...WASH} />
        <rect x="16.5" y="12" width="4.5" height="6.5" rx="2" {...WASH} />
        <path d="M18.75 18.5v.5a2.5 2.5 0 0 1-2.5 2.5H14" />
      </g>
      <rect
        className="glyph glyph-mark glyph-pop-late"
        x="10.5"
        y="20"
        width="4"
        height="3"
        rx="1.5"
        fill="currentColor"
      />
    </svg>
  );
}

/** A speech bubble holding a star: it rises from its tail and the star pops in. */
export function ReviewBubbleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        className="glyph glyph-rise"
        d="M7 4h10a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4h-6l-4 3.5V17a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z"
        {...OUTLINE}
        {...WASH}
      />
      <polygon
        className="glyph glyph-mark glyph-pop"
        points="12,6.9 13.04,9.08 15.42,9.39 13.67,11.04 14.12,13.41 12,12.26 9.88,13.41 10.33,11.04 8.58,9.39 10.96,9.08"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A rocket on its pad: it lifts off and the flame flickers. The first steps are not done. */
export function OnboardingRocketIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g className="glyph glyph-lift">
        <g {...OUTLINE}>
          <path d="M12 2.5c3 2 4.5 5.5 4.5 9.5l-2 3.5h-5l-2-3.5c0-4 1.5-7.5 4.5-9.5z" {...WASH} />
          <circle cx="12" cy="9" r="1.6" />
          <path d="M7.6 12.2 5 15l2.8 1.2M16.4 12.2 19 15l-2.8 1.2" />
        </g>
        <path
          className="glyph glyph-mark glyph-flame"
          d="M10.6 17.2h2.8L12 21.5z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

/** A chart line going downhill: it draws itself and the arrow lands. Sales are slipping. */
export function SalesDropIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M4 4v16h16" {...OUTLINE} />
      <path d="M4 20 7.5 8.5l4 4 3-2.5 5 6.5V20z" fill="currentColor" fillOpacity={0.14} />
      <path
        className="glyph glyph-trace"
        d="M7.5 8.5l4 4 3-2.5 5 6.5"
        pathLength={1}
        {...OUTLINE}
      />
      <path
        className="glyph glyph-mark glyph-land"
        d="M20 12.5V17h-4.5"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Each stroke of the checklist, in the order the hand draws it. */
const CHECKLIST_STROKES = [
  { path: "M7 9l1.5 1.5L11 8", width: 1.8, delay: 0 },
  { path: "M13.5 9.5h3.5", width: 1.6, delay: 200 },
  { path: "M7 15l1.5 1.5L11 14", width: 1.8, delay: 260 },
  { path: "M13.5 15.5h3.5", width: 1.6, delay: 460 },
] as const;

/** A checklist with every row ticked: drawn once, by hand, as the all-clear appears. */
export function ChecklistDoneIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" {...OUTLINE} {...WASH} />
      {CHECKLIST_STROKES.map((stroke) => (
        <path
          key={stroke.path}
          className="glyph-draw"
          d={stroke.path}
          pathLength={1}
          {...OUTLINE}
          strokeWidth={stroke.width}
          style={{ animationDelay: `${stroke.delay}ms` }}
        />
      ))}
    </svg>
  );
}
