import { ArrowRightIcon, CheckIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  countDoneSteps,
  findNextStep,
  SETUP_STEPS,
  type SetupProgress,
  type SetupStep,
} from "@/features/onboarding/setup-progress";

function ProgressBar({ progress }: { progress: SetupProgress }) {
  const done = countDoneSteps(progress);
  return (
    <div className="flex items-center gap-3">
      <progress
        className="h-1.5 flex-1 appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-brand"
        aria-label="Configuração da conta"
        max={SETUP_STEPS.length}
        value={done}
      />
      <span className="text-xs text-muted-foreground tabular-nums">
        {done} de {SETUP_STEPS.length}
      </span>
    </div>
  );
}

function StepCard({
  step,
  index,
  state,
}: {
  step: SetupStep;
  index: number;
  state: "done" | "next" | "later";
}) {
  return (
    <li
      className={cn(
        "flex flex-col gap-4 rounded-2xl p-5",
        state === "next" ? "bg-muted ring-1 ring-brand/60" : "bg-muted/50",
      )}
    >
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-full text-sm font-semibold",
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
        <p className={cn("font-medium", state === "done" && "text-muted-foreground")}>
          {step.title}
        </p>
        <p className="text-sm text-muted-foreground">{step.description}</p>
      </div>
      {state === "next" ? (
        <Button asChild className="w-fit">
          <Link to={step.to}>
            {step.cta}
            <ArrowRightIcon aria-hidden="true" />
          </Link>
        </Button>
      ) : null}
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

/** The dashboard for accounts still setting up: progress and the one next step in focus. */
export function SetupGuide({ progress }: { progress: SetupProgress }) {
  const nextKey = findNextStep(progress)?.key;
  return (
    <section
      aria-labelledby="setup-title"
      className="surface-card space-y-6 rounded-3xl bg-card p-6 sm:p-8"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
        <div className="space-y-2">
          <h2 id="setup-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Falta pouco para sua primeira venda
          </h2>
          <p className="text-sm text-muted-foreground">
            Três passos e seus indicadores começam a aparecer aqui.
          </p>
        </div>
        <ProgressBar progress={progress} />
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {SETUP_STEPS.map((step, index) => (
          <StepCard
            key={step.key}
            step={step}
            index={index}
            state={stepState(progress, step.key, nextKey)}
          />
        ))}
      </ol>
    </section>
  );
}

/** A thin reminder on other pages until the setup is done. */
export function SetupStrip({ progress }: { progress: SetupProgress }) {
  const next = findNextStep(progress);
  if (!next) {
    return null;
  }
  return (
    <aside
      aria-label="Configuração da conta"
      className="surface-card flex flex-col gap-3 rounded-3xl bg-card px-5 py-3 sm:flex-row sm:items-center"
    >
      <p className="text-sm">
        <span className="text-muted-foreground">
          Configuração {countDoneSteps(progress)} de {SETUP_STEPS.length} ·
        </span>{" "}
        Próximo passo: <span className="font-medium">{next.title.toLowerCase()}</span>
      </p>
      <div className="flex-1 sm:max-w-48">
        <ProgressBar progress={progress} />
      </div>
      <Button asChild size="sm" className="w-fit sm:ml-auto">
        <Link to={next.to}>{next.cta}</Link>
      </Button>
    </aside>
  );
}
