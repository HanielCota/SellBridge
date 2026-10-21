import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      // A labelled placeholder ("Carregando pedidos") is announced; a bare one is decoration.
      role={props["aria-label"] === undefined ? undefined : "status"}
      className={cn("animate-pulse rounded-lg bg-muted motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

export { Skeleton };
