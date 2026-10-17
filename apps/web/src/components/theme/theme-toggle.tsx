import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useTheme } from "./theme-provider";
import { Hint } from "@/components/ui/hint";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const label = theme === "dark" ? "Usar tema claro" : "Usar tema escuro";
  return (
    <Hint label={label}>
      <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={label}>
        <SunIcon className="hidden size-4 dark:block" aria-hidden="true" />
        <MoonIcon className="size-4 dark:hidden" aria-hidden="true" />
      </Button>
    </Hint>
  );
}
