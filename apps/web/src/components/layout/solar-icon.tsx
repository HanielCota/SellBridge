import { cn } from "@/lib/utils";
import { solarIcons } from "./solar-icons";

export type SolarIconName = keyof typeof solarIcons;

export function SolarIcon({ name, className }: { name: SolarIconName; className?: string }) {
  const icon = solarIcons[name];
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      data-icon={`solar:${icon.name}`}
      className={cn("size-5 shrink-0", className)}
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}
