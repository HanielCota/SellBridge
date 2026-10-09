import { PendingSubmitButton } from "@/components/form/form-feedback";

/** Large centered title + subtitle used by every page of the sign-in flow. */
export function AuthPageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-2 text-center">
      <h1 className="text-[30px] leading-[1.1] font-semibold tracking-[-0.03em]">{title}</h1>
      <p className="text-[17px] text-balance text-muted-foreground">{description}</p>
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
      className="mt-3 h-[52px] w-full rounded-full text-[17px] font-medium transition-[transform,background-color] duration-100 active:scale-[0.98] motion-reduce:active:scale-100"
    />
  );
}
