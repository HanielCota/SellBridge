import { useForm } from "@tanstack/react-form";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import {
  CheckCircleIcon,
  CheckIcon,
  FlaskIcon,
  PackageIcon,
  ShoppingBagIcon,
  TagIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { z } from "zod";
import { fieldBindings, submitHandler } from "@/components/form/form-bindings";
import { FormErrorAlert, PendingSubmitButton } from "@/components/form/form-feedback";
import { TextField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import {
  BRIDGE_REWIND_MS,
  StoreBridge,
  type StoreBridgeStatus,
} from "@/components/stores/store-bridge";
import { getAppSession } from "@/features/auth/session.functions";
import { startLinkChime } from "@/features/stores/link-chime";
import {
  approveMockAuthorization,
  getMockConsentCallback,
} from "@/features/stores/stores.functions";
import { errorMessage } from "@/lib/errors";
import { rewind } from "@/lib/rewind";
import { freeText } from "@sellbridge/shared/schemas";

const consentSearchSchema = z.object({
  state: z.string().min(1),
  redirect_uri: z.url({ protocol: /^https?$/ }),
});

export const Route = createFileRoute("/oauth/mock/autorizar")({
  validateSearch: consentSearchSchema,
  beforeLoad: async ({ location }) => {
    const session = await getAppSession();
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    const { callbackUrl } = await getMockConsentCallback();
    if (!callbackUrl) {
      throw notFound();
    }
    return { callbackUrl };
  },
  head: () => ({ meta: [{ title: "Autorizar acesso | Loja simulada" }] }),
  component: MockConsentPage,
});

const shopFormSchema = z.object({
  shopName: freeText().trim().min(3, "Informe o nome da loja"),
});

const REQUESTED_PERMISSIONS = [
  {
    icon: TagIcon,
    title: "Publicar e editar anúncios",
    text: "Criar anúncios com os produtos dos fornecedores que você escolher.",
  },
  {
    icon: PackageIcon,
    title: "Atualizar estoque e preço",
    text: "Manter o anúncio igual ao estoque do fornecedor e ao seu preço.",
  },
  {
    icon: ShoppingBagIcon,
    title: "Ler pedidos e vendas",
    text: "Trazer cada venda para o seu financeiro.",
  },
] as const;

/**
 * The arc draws and the permissions tick for at least this long, even when the server answers
 * sooner, so the link reads as something that happened. Feeds `--link-duration` in the CSS.
 */
const LINK_MS = 1500;

/** Long enough to register the latch and the check before the page leaves for the callback. */
const CONNECTED_PAUSE_MS = 700;

/** The checks undo last-first, this far apart. */
const CHECK_REWIND_STAGGER_MS = 60;
const CHECK_REWIND_MS = 200;

/** Holds `failed` until the arc and the checks are back, then the page settles to idle. */
const FAILED_HOLD_MS = BRIDGE_REWIND_MS + 2 * CHECK_REWIND_STAGGER_MS;

const linkDurationStyle: CSSProperties = { "--link-duration": `${LINK_MS}ms` };

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ConsentSearch = z.infer<typeof consentSearchSchema>;

/** Goes back through the callback the server trusts, never the `redirect_uri` from the URL. */
function denyAuthorization(callbackUrl: string, state: string) {
  const url = new URL(callbackUrl);
  url.searchParams.set("error", "access_denied");
  url.searchParams.set("state", state);
  window.location.assign(url.toString());
}

function useConsentForm(search: ConsentSearch) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [failed, setFailed] = useState(false);

  // Owned by an effect so a resubmit (which resets `failed`) or leaving the page cancels it.
  useEffect(() => {
    if (!failed) {
      return undefined;
    }
    const timer = setTimeout(() => setFailed(false), FAILED_HOLD_MS);
    return () => clearTimeout(timer);
  }, [failed]);

  const form = useForm({
    defaultValues: { shopName: "" },
    validators: { onSubmit: shopFormSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      setFailed(false);
      const chime = startLinkChime(LINK_MS);
      try {
        const [result] = await Promise.all([
          approveMockAuthorization({
            data: {
              shopName: value.shopName,
              state: search.state,
              redirectUri: search.redirect_uri,
            },
          }),
          wait(LINK_MS),
        ]);
        setConnected(true);
        chime.linked();
        await wait(CONNECTED_PAUSE_MS);
        window.location.assign(result.redirectTo);
      } catch (error) {
        chime.failed();
        setFailed(true);
        setSubmitError(errorMessage(error));
      }
    },
  });

  return { form, submitError, connected, failed };
}

type ConsentFormApi = ReturnType<typeof useConsentForm>["form"];

function bridgeStatus(
  isSubmitting: boolean,
  connected: boolean,
  failed: boolean,
): StoreBridgeStatus {
  if (connected) return "connected";
  if (failed) return "failed";
  if (isSubmitting) return "authorizing";
  return "idle";
}

function ConsentHeader({ status }: { status: StoreBridgeStatus }) {
  return (
    <header className="space-y-6 text-center">
      <StoreBridge marketplace="mock" status={status} />
      <div className="space-y-2">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          <FlaskIcon className="size-3.5" aria-hidden="true" />
          Marketplace simulado · ambiente de teste
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Autorizar o SellBridge</h1>
        <p className="text-sm text-muted-foreground">
          O SellBridge vai poder fazer o seguinte na sua loja:
        </p>
      </div>
    </header>
  );
}

/** On failure, each check that showed fades back into its icon, the last one first. */
function useRewindChecks(status: StoreBridgeStatus) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (status !== "failed" || !list) {
      return undefined;
    }
    const rows = Array.from(list.children);
    const animations = rows.flatMap((row, index) => {
      const options = {
        duration: CHECK_REWIND_MS,
        delay: (rows.length - 1 - index) * CHECK_REWIND_STAGGER_MS,
        easing: "ease-out",
      };
      const icon = row.querySelector(".consent-permission-icon");
      const done = row.querySelector(".consent-permission-done");
      if (!icon || !done) {
        return [];
      }
      return [
        rewind(done, "opacity", "0", options),
        rewind(icon, "opacity", "1", options),
        rewind(icon, "transform", "none", options),
      ];
    });
    return () => {
      for (const animation of animations) {
        animation.cancel();
      }
    };
  }, [status]);

  return listRef;
}

function PermissionList({ status }: { status: StoreBridgeStatus }) {
  const listRef = useRewindChecks(status);
  return (
    <ul
      ref={listRef}
      data-status={status}
      className="surface-card divide-y divide-border rounded-2xl bg-muted/50"
    >
      {REQUESTED_PERMISSIONS.map((permission, index) => (
        <li key={permission.title} className="flex gap-3 p-4" style={{ "--step": index + 1 }}>
          <span className="relative mt-0.5 size-5 shrink-0 text-brand-text" aria-hidden="true">
            <permission.icon className="consent-permission-icon absolute inset-0 size-5" />
            <CheckCircleIcon
              weight="fill"
              className="consent-permission-done absolute inset-0 size-5"
            />
          </span>
          <div className="space-y-0.5">
            <p className="text-sm font-medium">{permission.title}</p>
            <p className="text-xs text-muted-foreground">{permission.text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ConsentSubmitButton({ status }: { status: StoreBridgeStatus }) {
  if (status !== "connected") {
    return (
      <PendingSubmitButton
        isPending={status === "authorizing"}
        idleLabel="Autorizar acesso"
        pendingLabel="Vinculando…"
        className="h-11 w-full text-subhead"
      />
    );
  }
  return (
    <Button type="button" className="pointer-events-none h-11 w-full text-subhead">
      <CheckIcon weight="bold" aria-hidden="true" />
      Loja vinculada
    </Button>
  );
}

function ConsentForm({
  form,
  submitError,
  search,
  connected,
  failed,
}: {
  form: ConsentFormApi;
  submitError: string | null;
  search: ConsentSearch;
  connected: boolean;
  failed: boolean;
}) {
  const { callbackUrl } = Route.useRouteContext();
  return (
    <form noValidate onSubmit={submitHandler(() => form.handleSubmit())} className="space-y-6">
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <PermissionList status={bridgeStatus(isSubmitting, connected, failed)} />
        )}
      </form.Subscribe>
      <FormErrorAlert message={submitError} />
      <form.Field name="shopName">
        {(field) => (
          <TextField
            id="shopName"
            label="Nome da loja"
            placeholder="Ex.: Loja da Ana"
            {...fieldBindings(field)}
          />
        )}
      </form.Field>
      <div className="space-y-2">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <ConsentSubmitButton status={bridgeStatus(isSubmitting, connected, failed)} />
          )}
        </form.Subscribe>
        <output className="sr-only">
          {connected ? "Loja vinculada. Voltando para o SellBridge." : ""}
        </output>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="w-full"
          onClick={() => denyAuthorization(callbackUrl, search.state)}
        >
          Cancelar
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Você pode desconectar a loja quando quiser, na página Lojas.
      </p>
    </form>
  );
}

function MockConsentPage() {
  const search = Route.useSearch();
  const { form, submitError, connected, failed } = useConsentForm(search);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-svh items-center justify-center bg-background px-4 py-10"
    >
      <div
        className="surface-card w-full max-w-md space-y-8 rounded-3xl bg-card p-6 sm:p-8"
        style={linkDurationStyle}
      >
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <ConsentHeader status={bridgeStatus(isSubmitting, connected, failed)} />
          )}
        </form.Subscribe>
        <ConsentForm
          form={form}
          submitError={submitError}
          search={search}
          connected={connected}
          failed={failed}
        />
      </div>
    </main>
  );
}
