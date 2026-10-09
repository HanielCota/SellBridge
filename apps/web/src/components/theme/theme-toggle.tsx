import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useTheme } from "./theme-provider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const label = theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro";
  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={label} title={label}>
      <SunIcon className="hidden size-4 dark:block" aria-hidden="true" />
      <MoonIcon className="size-4 dark:hidden" aria-hidden="true" />
    </Button>
  );
}
