import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-24 w-full rounded-xl px-3.5 py-2.5 leading-relaxed border border-field-border bg-field text-subhead transition-[border-color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-brand-strong focus-visible:ring-4 focus-visible:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/15",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
