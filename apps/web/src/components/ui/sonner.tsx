"use client";

import {
  CheckIcon,
  CircleNotchIcon,
  ExclamationMarkIcon,
  InfoIcon,
  XIcon,
} from "@phosphor-icons/react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/components/theme/theme-provider";

const ICON = "size-3.5";
const MOBILE_OFFSET = {
  top: 16,
  right: 16,
  left: 16,
  bottom: "calc(16px + env(safe-area-inset-bottom))",
};

/**
 * Notifications rise from the bottom center, near where actions happen, as a solid
 * card on the same surface as popovers. The type shows as a small colored badge with an icon,
 * never as a tinted background.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme}
      position="bottom-center"
      offset={24}
      // Above the iPhone home indicator: the app draws edge to edge (viewport-fit=cover).
      mobileOffset={MOBILE_OFFSET}
      gap={10}
      icons={{
        success: <CheckIcon weight="bold" className={ICON} />,
        info: <InfoIcon weight="bold" className={ICON} />,
        warning: <ExclamationMarkIcon weight="bold" className={ICON} />,
        error: <XIcon weight="bold" className={ICON} />,
        loading: <CircleNotchIcon weight="bold" className={`${ICON} animate-spin`} />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group flex w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-border bg-popover py-3 pr-4 pl-3 text-popover-foreground shadow-[0_12px_40px_-8px_rgb(0_0_0/0.45)] sm:w-[400px]",
          icon: "m-0 flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-foreground",
          success: "[&_[data-icon]]:bg-brand [&_[data-icon]]:text-primary-foreground",
          error:
            "[&_[data-icon]]:bg-destructive [&_[data-icon]]:text-white dark:[&_[data-icon]]:text-black",
          warning: "[&_[data-icon]]:bg-amber-400 [&_[data-icon]]:text-black",
          content: "min-w-0 flex-1",
          title: "text-sm leading-snug font-medium",
          description: "mt-0.5 text-xs leading-snug text-muted-foreground",
          actionButton:
            "ml-auto shrink-0 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background",
          cancelButton:
            "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
