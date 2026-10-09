import { cn } from "cn";
import { ArrowFatUpIcon, EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { type ComponentProps, type KeyboardEvent, type ReactNode, useState } from "react";
import { firstErrorMessage } from "./form-field";

type NativeInputProps = Omit<ComponentProps<"input">, "id" | "onChange" | "value" | "placeholder">;

interface FloatingFieldProps extends NativeInputProps {
  id: string;
  label: string;
  value: string;
  errors: readonly unknown[];
  onValueChange: (value: string) => void;
  /** Guidance shown below the field while there is no error (e.g. password rules). */
  hint?: string | undefined;
  /** Marks the field invalid without a message of its own (the message lives elsewhere). */
  invalid?: boolean | undefined;
}

interface FloatingInputProps extends FloatingFieldProps {
  trailing?: ReactNode;
  notice?: ReactNode;
}

function FieldFootnote({
  id,
  message,
  hint,
}: {
  id: string;
  message: string | null;
  hint?: string | undefined;
}) {
  if (message) {
    return (
      <p id={id} className="px-1 text-[13px] text-destructive">
        {message}
      </p>
    );
  }
  if (hint) {
    return (
      <p id={id} className="px-1 text-[13px] text-muted-foreground">
        {hint}
      </p>
    );
  }
  return null;
}

/**
 * Tall field whose label sits inside it and moves up once the field is focused or filled.
 * The label stays a real <label>, so screen readers and getByLabel keep working.
 */
function FloatingInput({
  id,
  label,
  value,
  errors,
  onValueChange,
  hint,
  invalid,
  trailing,
  notice,
  className,
  ...inputProps
}: FloatingInputProps) {
  const message = firstErrorMessage(errors);
  const footnoteId = `${id}-footnote`;
  const isInvalid = Boolean(message) || Boolean(invalid);
  return (
    <div className="grid gap-1.5">
      <div className="relative">
        <input
          id={id}
          value={value}
          placeholder=" "
          onChange={(event) => onValueChange(event.target.value)}
          aria-invalid={isInvalid ? true : undefined}
          aria-describedby={message || hint ? footnoteId : undefined}
          className={cn(
            "peer h-14 w-full rounded-xl border border-field-border bg-field px-4 pt-5 pb-1.5 text-[17px] tracking-[-0.01em] text-foreground transition-[border-color,box-shadow] duration-150 outline-none",
            "focus:border-brand-strong focus:ring-4 focus:ring-brand/20",
            "aria-invalid:border-destructive aria-invalid:focus:ring-destructive/15",
            trailing ? "pr-12" : null,
            className,
          )}
          {...inputProps}
        />
        <label
          htmlFor={id}
          className="pointer-events-none absolute top-1/2 left-4 origin-left -translate-y-1/2 text-[17px] text-muted-foreground transition-all duration-150 ease-out peer-focus:top-[1.15rem] peer-focus:text-xs peer-[:not(:placeholder-shown)]:top-[1.15rem] peer-[:not(:placeholder-shown)]:text-xs motion-reduce:transition-none"
        >
          {label}
        </label>
        {trailing}
      </div>
      {notice}
      <FieldFootnote id={footnoteId} message={message} hint={hint} />
    </div>
  );
}

export function FloatingTextField(props: FloatingFieldProps) {
  return <FloatingInput {...props} />;
}

function usePasswordFieldState() {
  const [isVisible, setIsVisible] = useState(false);
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);
  function trackCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setIsCapsLockOn(event.getModifierState("CapsLock"));
  }
  return {
    isVisible,
    isCapsLockOn,
    toggleVisibility: () => setIsVisible((visible) => !visible),
    trackCapsLock,
    clearCapsLock: () => setIsCapsLockOn(false),
  };
}

function CapsLockNotice() {
  return (
    <output className="flex items-center gap-1 px-1 text-[13px] text-muted-foreground">
      <ArrowFatUpIcon className="size-4" aria-hidden="true" />
      Caps Lock está ativado
    </output>
  );
}

/** Floating-label password field with a show/hide toggle and a Caps Lock warning. */
export function FloatingPasswordField({ onBlur, ...props }: Omit<FloatingFieldProps, "type">) {
  const state = usePasswordFieldState();
  const ToggleIcon = state.isVisible ? EyeSlashIcon : EyeIcon;
  const toggle = (
    <button
      type="button"
      onClick={state.toggleVisibility}
      aria-label={state.isVisible ? "Ocultar senha" : "Mostrar senha"}
      aria-pressed={state.isVisible}
      className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:text-foreground"
    >
      <ToggleIcon className="size-[18px]" aria-hidden="true" />
    </button>
  );
  return (
    <FloatingInput
      {...props}
      type={state.isVisible ? "text" : "password"}
      onKeyDown={state.trackCapsLock}
      onKeyUp={state.trackCapsLock}
      onBlur={(event) => {
        state.clearCapsLock();
        onBlur?.(event);
      }}
      trailing={toggle}
      notice={state.isCapsLockOn ? <CapsLockNotice /> : null}
    />
  );
}
