import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { useId } from "react";
import { cn } from "@/lib/utils";
import { type Theme, useTheme } from "./theme-provider";

/** Same track as the ui Switch when off: a choice between two looks, so no "on" brand color. */
const TRACK =
  "flex h-5 w-8 shrink-0 items-center rounded-full bg-foreground/45 p-0.5 dark:bg-input";

const KNOB =
  "block size-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none";

/** The knob rests beside the moon in the dark theme and beside the sun in the light one. */
function knobPosition(theme: Theme): string {
  return theme === "dark" ? "translate-x-0" : "translate-x-3";
}

function iconTone(active: boolean): string {
  return active ? "text-foreground" : "text-muted-foreground";
}

/**
 * Moon, track and sun, drawn for a row that already carries the state (the profile menu's
 * checkbox item). Decorative: the row is what assistive technology reads.
 */
export function ThemeSwitchTrack({ theme }: { theme: Theme }) {
  return (
    <span aria-hidden="true" className="ml-auto flex shrink-0 items-center gap-1.5">
      <MoonIcon className={cn("size-4", iconTone(theme === "dark"))} weight="fill" />
      <span className={TRACK}>
        <span className={cn(KNOB, knobPosition(theme))} />
      </span>
      <SunIcon className={cn("size-4", iconTone(theme === "light"))} weight="fill" />
    </span>
  );
}

/**
 * The theme on its own, outside a menu (the sign-in pages): the word "Tema", then a real switch
 * with the moon on the left and the sun on the right. It reads as "Tema escuro", on in the dark
 * theme; Space or Enter flips it.
 */
export function ThemeSwitch({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const labelId = useId();
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span id={labelId} className="text-sm text-muted-foreground">
        Tema<span className="sr-only"> escuro</span>
      </span>
      <SwitchPrimitive.Root
        aria-labelledby={labelId}
        checked={theme === "dark"}
        onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        // 44 px tall around the drawing, so a thumb hits it on a phone.
        className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <MoonIcon
          className={cn("size-4", iconTone(theme === "dark"))}
          weight="fill"
          aria-hidden="true"
        />
        <span className={TRACK}>
          <SwitchPrimitive.Thumb className={cn(KNOB, knobPosition(theme))} />
        </span>
        <SunIcon
          className={cn("size-4", iconTone(theme === "light"))}
          weight="fill"
          aria-hidden="true"
        />
      </SwitchPrimitive.Root>
    </div>
  );
}
