import { PendingSubmitButton } from "@/components/form/form-feedback";

/** Large centered title + subtitle used by every page of the sign-in flow. */
export function AuthPageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-2 text-center">
      <h1 className="text-3xl leading-tight font-semibold tracking-tight">{title}</h1>
      <p className="text-body text-balance text-muted-foreground">{description}</p>
    </div>
  );
}

interface AuthSubmitButtonProps {
  isPending: boolean;
  idleLabel: string;
  pendingLabel: string;
}

/** Full-width pill button that reacts on press, as in the rest of the sign-in flow. */
export function AuthSubmitButton(props: AuthSubmitButtonProps) {
  return (
    <PendingSubmitButton
      {...props}
      className="mt-3 h-13 w-full rounded-full text-body font-medium transition-[transform,background-color] duration-100 active:scale-[0.98] motion-reduce:active:scale-100"
    />
  );
}
