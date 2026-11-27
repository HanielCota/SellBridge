import { ArrowRightIcon, CaretDownIcon, CaretUpIcon, CheckIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { createContext, useCallback, useContext, useRef, type ReactNode, type Ref } from "react";
import { cn } from "@/lib/utils";
import { ResendVerificationButton } from "@/components/onboarding/resend-verification-button";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import {
  countDoneSteps,
  findNextStep,
  getSetupSteps,
  remainingSetupMinutes,
  SETUP_STEPS,
  setupEtaLabel,
  setupPercent,
  type SetupProgress,
  type SetupStep,
} from "@/features/onboarding/setup-progress";
import { setupGuideView, useSetupGuideChoice } from "@/features/onboarding/setup-guide-visibility";

function ProgressBar({ progress }: { progress: SetupProgress }) {
  const done = countDoneSteps(progress);
  const percent = setupPercent(progress);
  return (
    <span className="flex items-center gap-3">
      <progress
        className="h-1.5 flex-1 appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-brand"
        aria-label="Configuração da conta"
        aria-valuetext={`${percent}% · ${done} de ${SETUP_STEPS.length} passos`}
        max={SETUP_STEPS.length}
        value={done}
      />
      <span className="text-xs text-muted-foreground tabular-nums">{percent}%</span>
    </span>
  );
}

const HIDE_STEPS_LABEL = "Esconder os passos";
const SHOW_STEPS_LABEL = "Mostrar os passos";
const TOGGLE_FOCUS_CLASS_NAME =
  "rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/40";

const STEP_ACTION_CLASS_NAME = "h-auto min-h-9 w-fit max-w-full py-2 text-center whitespace-normal";

/** The e-mail step resends the link; every other step opens its page. */
function StepAction({ step, done = false }: { step: SetupStep; done?: boolean }) {
  if (step.key === "hasVerifiedEmail") {
    if (done) {
      return (
        <Button asChild variant="outline" className={STEP_ACTION_CLASS_NAME}>
          <Link to="/perfil">Ver e-mail</Link>
        </Button>
      );
    }
    return <ResendVerificationButton label={step.cta} className={STEP_ACTION_CLASS_NAME} />;
  }
  if (step.key === "hasHolder" || step.key === "hasSupplier") {
    const isHolder = step.key === "hasHolder";
    return (
      <Button asChild variant={done ? "outline" : "default"} className={STEP_ACTION_CLASS_NAME}>
        <Link
          to="/onboarding"
          search={{ step: isHolder ? "details" : "supplier", flow: done ? undefined : "setup" }}
        >
          {done ? (isHolder ? "Editar dados" : "Trocar fornecedor") : step.cta}
          <ArrowRightIcon aria-hidden="true" />
        </Link>
      </Button>
    );
  }
  return (
    <Button asChild variant={done ? "outline" : "default"} className={STEP_ACTION_CLASS_NAME}>
      <Link to={step.to}>
        {done ? (step.key === "hasStore" ? "Ver lojas" : "Ver catálogo") : step.cta}
        <ArrowRightIcon aria-hidden="true" />
      </Link>
    </Button>
  );
}

/** One numbered step of a first-steps guide; the supplier home's guide uses it too (item 38). */
export function StepCard({
  title,
  description,
  estimatedMinutes,
  index,
  state,
  action,
  compact = false,
}: {
  title: string;
  description: string;
  /** Shown while the step is not done; left out where there is no estimate. */
  estimatedMinutes?: number;
  index: number;
  state: "done" | "next" | "later";
  action: ReactNode;
  /** Tighter spacing, for the reseller's dashboard guide that sits above the numbers. */
  compact?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex min-w-0 flex-col rounded-2xl",
        compact ? "gap-3 p-4" : "gap-4 p-5",
        state === "next" ? "bg-muted ring-1 ring-brand/60" : "bg-muted/50",
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full text-sm font-semibold",
          compact ? "size-8" : "size-9",
          state === "done"
            ? "bg-brand text-primary-foreground"
            : "bg-background text-muted-foreground",
        )}
      >
        {state === "done" ? (
          <>
            <CheckIcon weight="bold" className="size-4" aria-hidden="true" />
            <span className="sr-only">Concluído</span>
          </>
        ) : (
          index + 1
        )}
      </span>
      <div className="flex-1 space-y-1">
        <p className={cn("font-medium", state === "done" && "text-muted-foreground")}>{title}</p>
        {state === "done" || estimatedMinutes === undefined ? null : (
          <p className="text-caption text-muted-foreground tabular-nums">~{estimatedMinutes} min</p>
        )}
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </li>
  );
}

function stepState(
  progress: SetupProgress,
  key: SetupStep["key"],
  nextKey: SetupStep["key"] | undefined,
): "done" | "next" | "later" {
  if (progress[key]) {
    return "done";
  }
  return key === nextKey ? "next" : "later";
}

interface GuideToggleProps {
  onToggle: () => void;
  /** The toggle button, focused after the guide switches format so the keyboard stays in place. */
  toggleRef?: Ref<HTMLButtonElement> | undefined;
}

/**
 * The guide's title is its fold button, so the arrow never stands alone without words. The arrow
 * sits in the card's top corner, where the folded strip shows its own.
 */
function GuideTitleToggle({ onToggle, toggleRef }: GuideToggleProps) {
  return (
    <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
      <Hint label={HIDE_STEPS_LABEL} openOnTap={false}>
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={true}
          onClick={onToggle}
          className={cn("-m-1 p-1 text-left", TOGGLE_FOCUS_CLASS_NAME)}
        >
          <span id="setup-title">Falta pouco para sua primeira venda</span>
          <span className="sr-only">{HIDE_STEPS_LABEL}</span>
          <span
            data-testid="setup-guide-caret"
            className="absolute top-5 right-5 flex h-7 items-center sm:top-6 sm:right-6 sm:h-8"
            aria-hidden="true"
          >
            <CaretUpIcon className="size-5 text-muted-foreground" />
          </span>
        </button>
      </Hint>
    </h2>
  );
}

/** The dashboard's guide while the setup is not done: progress and the one next step in focus. */
function SetupGuide({
  progress,
  onToggle,
  toggleRef,
}: { progress: SetupProgress } & GuideToggleProps) {
  const nextKey = findNextStep(progress)?.key;
  return (
    <section
      aria-labelledby="setup-title"
      className="surface-card relative space-y-4 rounded-3xl bg-card p-5 sm:p-6"
    >
      <div className="grid gap-4 pr-9 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
        <div className="space-y-2">
          <GuideTitleToggle onToggle={onToggle} toggleRef={toggleRef} />
          <p className="text-sm text-muted-foreground">
            {SETUP_STEPS.length} passos e suas vendas começam a aparecer nos números abaixo.
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{setupEtaLabel(progress)}</p>
          <ProgressBar progress={progress} />
        </div>
      </div>
      <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {getSetupSteps().map((step, index) => {
          const state = stepState(progress, step.key, nextKey);
          return (
            <StepCard
              key={step.key}
              title={step.title}
              description={step.description}
              estimatedMinutes={step.estimatedMinutes}
              index={index}
              state={state}
              action={<StepAction step={step} done={state === "done"} />}
              compact
            />
          );
        })}
      </ol>
    </section>
  );
}

function useDashboardSetupFocus() {
  const pending = useRef(false);
  const request = useCallback(() => {
    pending.current = true;
  }, []);
  const focus = useCallback((button: HTMLButtonElement | null) => {
    if (button !== null && pending.current) {
      pending.current = false;
      button.focus({ preventScroll: true });
    }
  }, []);
  return { request, focus };
}

export const DashboardSetupFocusContext = createContext<ReturnType<
  typeof useDashboardSetupFocus
> | null>(null);

export function DashboardSetupProvider({ children }: { children: ReactNode }) {
  const focus = useDashboardSetupFocus();
  return <DashboardSetupFocusContext value={focus}>{children}</DashboardSetupFocusContext>;
}

/**
 * The setup guide on top of the dashboard until the setup is done: a mini tutorial, never
 * removed. The reseller may minimize it to the strip the other pages show; this browser
 * remembers it. Before hydration both are in the HTML and the mark the init script left on
 * `<html>` keeps only the remembered one, so nothing jumps.
 */
export function DashboardSetupGuide({
  progress,
  inHeader = false,
}: {
  progress: SetupProgress;
  inHeader?: boolean;
}) {
  const { choice, setHidden } = useSetupGuideChoice();
  const view = setupGuideView(findNextStep(progress) === undefined, choice);
  const headerFocus = useContext(DashboardSetupFocusContext);
  const localFocus = useDashboardSetupFocus();
  const { request, focus } = headerFocus ?? localFocus;

  function toggle(hidden: boolean) {
    request();
    setHidden(hidden);
  }

  if (view === "none") {
    return null;
  }
  return (
    <div
      className="dashboard-setup-guide"
      data-view={view}
      data-below-header={(headerFocus !== null && !inHeader) || undefined}
    >
      {inHeader ? null : (
        <div data-guide-part="open" inert={view === "collapsed"}>
          <div>
            <SetupGuide
              progress={progress}
              onToggle={() => toggle(true)}
              toggleRef={view === "open" ? focus : undefined}
            />
          </div>
        </div>
      )}
      {inHeader || headerFocus === null ? (
        <div data-guide-part="collapsed" inert={view === "open"}>
          <div>
            <SetupStrip
              progress={progress}
              onToggle={() => toggle(false)}
              toggleRef={view === "collapsed" ? focus : undefined}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** On the dashboard the whole strip unfolds the guide; the next step keeps its own button. */
function StripToggle({
  onToggle,
  toggleRef,
  text,
  bar,
}: GuideToggleProps & { text: ReactNode; bar: ReactNode }) {
  return (
    <Hint label={SHOW_STEPS_LABEL} openOnTap={false}>
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={false}
        onClick={onToggle}
        className={cn(
          "-m-1 flex min-w-0 flex-1 flex-col gap-3 p-1 text-left sm:flex-row sm:items-center",
          TOGGLE_FOCUS_CLASS_NAME,
        )}
      >
        <span className="flex items-start justify-between gap-3 sm:contents">
          {text}
          <CaretDownIcon
            className="size-5 shrink-0 text-muted-foreground sm:hidden"
            aria-hidden="true"
          />
        </span>
        {bar}
        <span className="sr-only">{SHOW_STEPS_LABEL}</span>
        <CaretDownIcon
          className="hidden size-5 shrink-0 text-muted-foreground sm:ml-auto sm:block"
          aria-hidden="true"
        />
      </button>
    </Hint>
  );
}

/**
 * A thin reminder on other pages until the setup is done. On the dashboard it is the minimized
 * guide, with the button that brings the whole guide back. On the page of the step being done
 * (`current`) it only shows the progress, so one step leads to the next with the bar in sight.
 */
export function SetupStrip({
  progress,
  onToggle,
  toggleRef,
  current = false,
}: { progress: SetupProgress; current?: boolean } & Partial<GuideToggleProps>) {
  const next = findNextStep(progress);
  if (!next) {
    return null;
  }
  const text = (
    <span className="block text-sm">
      <span className="text-muted-foreground tabular-nums">
        Configuração {setupPercent(progress)}% · ~{remainingSetupMinutes(progress)} min ·
      </span>{" "}
      {current ? "Passo atual" : "Próximo passo"}:{" "}
      <span className="font-medium">{next.title.toLowerCase()}</span>
    </span>
  );
  const bar = (
    <span className="block flex-1 sm:max-w-48">
      <ProgressBar progress={progress} />
    </span>
  );
  return (
    <aside
      aria-label="Configuração da conta"
      className="surface-card flex flex-col gap-3 rounded-3xl bg-card px-5 py-3 sm:flex-row sm:items-center"
    >
      {current ? null : (
        <div className="flex shrink-0 flex-wrap gap-2">
          <StepAction step={next} />
        </div>
      )}
      {onToggle === undefined ? (
        <>
          {text}
          {bar}
        </>
      ) : (
        <StripToggle onToggle={onToggle} toggleRef={toggleRef} text={text} bar={bar} />
      )}
    </aside>
  );
}
