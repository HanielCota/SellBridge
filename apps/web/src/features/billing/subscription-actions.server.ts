import {
  findBillingHolder,
  findBillingOwnerEmail,
  getBillingAccount,
  requireBillingOwner,
  saveBillingAccount,
  tryLockBillingCheckout,
  type BillingHolder,
} from "@sellbridge/database/repositories";
import {
  asaasDueDate,
  isAsaasError,
  type AsaasBillingClient,
  type AsaasCheckoutPayer,
} from "@sellbridge/payments/asaas";
import {
  billingPlan,
  isBillingPlanId,
  type BillingPlan,
  type BillingPlanId,
} from "@sellbridge/shared/billing";
import { AppError, conflictError, validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { billingClient } from "./billing-config.server";
import {
  CHARGE_REFERENCE,
  CHECKOUT_REFERENCE,
  planDescription,
  readSubscriptionState,
} from "./billing-sync.server";
import { planChangeOf, type PlanChange } from "./plan-change";

export type BillingPaymentMethod = "pix" | "credit_card";
type BillingAccount = NonNullable<Awaited<ReturnType<typeof getBillingAccount>>>;

const DAY_IN_MS = 86_400_000;
const UNREACHABLE_MESSAGE =
  "Não conseguimos falar com o Asaas agora. Tente de novo em alguns minutos.";

/** One subscription change per tenant at a time; it holds no row, only an advisory lock. */
async function withBillingLock<Result>(tenantId: string, run: () => Promise<Result>) {
  try {
    return await database.transaction(async (transaction) => {
      if (!(await tryLockBillingCheckout(transaction, tenantId))) {
        throw conflictError("Já estamos cuidando da sua assinatura. Aguarde alguns segundos.");
      }
      return run();
    });
  } catch (error) {
    if (!isAsaasError(error)) throw error;
    logger.warn("billing.asaas_failed", { error, status: error.status, codes: error.codes });
    throw new AppError("EXTERNAL_PROVIDER", UNREACHABLE_MESSAGE, { cause: error });
  }
}

function returnUrl(kind: "sucesso" | "troca" | "cancelado"): string {
  return new URL(`/assinatura?retorno=${kind}`, environment.APP_URL).toString();
}

function dayLabel(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    timeZone: REPORT_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
  });
}

function isLive(account: BillingAccount): boolean {
  const paying = account.status === "active" || account.status === "past_due";
  return account.subscriptionId !== null && !account.cancelAtPeriodEnd && paying;
}

/** A month already paid that has not run out: a new subscription starts charging after it. */
function paidMonthLeft(account: BillingAccount | null): Date | null {
  if (account === null || account.periodEnd === null) return null;
  if (account.status !== "active" && account.status !== "past_due") return null;
  return account.periodEnd > new Date() ? account.periodEnd : null;
}

async function liveAccount(tenantId: string): Promise<BillingAccount> {
  const account = await getBillingAccount(database, tenantId);
  if (account === null || !isLive(account) || account.subscriptionId === null) {
    throw conflictError("Você ainda não tem uma assinatura ativa.");
  }
  if (account.status === "past_due") {
    throw conflictError("Pague a mensalidade em aberto antes de mudar a assinatura.");
  }
  return account;
}

async function payerOf(tenantId: string): Promise<{ holder: BillingHolder; email: string }> {
  const [holder, email] = await Promise.all([
    findBillingHolder(database, tenantId),
    findBillingOwnerEmail(database, tenantId),
  ]);
  if (holder === null || email === null) {
    throw validationError(
      "Complete seus dados de cobrança (nome e CPF) em Configurações para assinar.",
    );
  }
  return { holder, email };
}

function registeredName(holder: BillingHolder) {
  if (holder.company !== null) {
    return { name: holder.company.companyName, cpfCnpj: holder.company.cnpj };
  }
  return { name: holder.fullName, cpfCnpj: holder.cpf };
}

/** Asaas fills the checkout only with the whole address and phone; otherwise its page asks. */
function checkoutPayer(holder: BillingHolder, email: string): AsaasCheckoutPayer | null {
  const { address, phone } = holder;
  if (address === null || phone === null) return null;
  return {
    ...registeredName(holder),
    email,
    phone,
    address: address.street,
    addressNumber: address.number,
    complement: address.complement,
    province: address.neighborhood,
    postalCode: address.cep,
    city: address.city,
  };
}

async function ensureSubscriber(
  client: AsaasBillingClient,
  tenantId: string,
  account: BillingAccount | null,
): Promise<string> {
  if (account?.customerId != null) return account.customerId;
  const { holder, email } = await payerOf(tenantId);
  const existing = await client.findSubscriber(tenantId);
  const customerId =
    existing ??
    (await client.createSubscriber({
      ...registeredName(holder),
      email,
      externalReference: tenantId,
    }));
  await saveBillingAccount(database, tenantId, { customerId });
  return customerId;
}

/** Closes what was opened and never paid, so an old link cannot start a second subscription. */
async function retireUnpaid(client: AsaasBillingClient, account: BillingAccount): Promise<void> {
  const reference = account.pendingReference;
  const steps: Promise<unknown>[] = [];
  if (reference?.startsWith(CHECKOUT_REFERENCE) === true) {
    steps.push(client.cancelCheckout(reference.slice(CHECKOUT_REFERENCE.length)));
  }
  if (reference?.startsWith(CHARGE_REFERENCE) === true) {
    steps.push(client.deleteCharge(reference.slice(CHARGE_REFERENCE.length)));
  }
  if (account.subscriptionId !== null && account.status === "incomplete") {
    steps.push(client.deleteSubscription(account.subscriptionId));
  }
  const results = await Promise.allSettled(steps);
  for (const result of results) {
    if (result.status === "rejected") {
      logger.warn("billing.retire_unpaid_failed", { error: result.reason });
    }
  }
}

async function openPixSubscription(
  client: AsaasBillingClient,
  input: { tenantId: string; account: BillingAccount | null; plan: BillingPlan },
) {
  const prepaidUntil = paidMonthLeft(input.account);
  const firstDueDate =
    prepaidUntil === null
      ? asaasDueDate(new Date(), 0)
      : asaasDueDate(new Date(prepaidUntil.getTime() - DAY_IN_MS), 0);
  const customerId = await ensureSubscriber(client, input.tenantId, input.account);
  const subscription = await client.createPixSubscription({
    customerId,
    valueCents: input.plan.priceCents,
    firstDueDate,
    description: planDescription(input.plan.id),
    externalReference: input.tenantId,
  });
  await saveBillingAccount(database, input.tenantId, {
    subscriptionId: subscription.id,
    plan: input.plan.id,
    paymentMethod: "pix",
    prepaidUntil,
    cancelAtPeriodEnd: false,
    pendingPlan: null,
    pendingReference: null,
    scheduledPlan: null,
    scheduledPlanAt: null,
    ...(prepaidUntil === null ? { status: "incomplete", periodEnd: null } : {}),
  });
  const charges = await client.listSubscriptionCharges(subscription.id);
  const first = charges.find((charge) => charge.status === "PENDING" && charge.invoiceUrl != null);
  if (first?.invoiceUrl == null) {
    throw validationError(
      "O Pix ainda não ficou pronto. Abra a assinatura de novo em alguns segundos.",
    );
  }
  return { url: first.invoiceUrl };
}

async function openCardCheckout(
  client: AsaasBillingClient,
  input: { tenantId: string; charged: BillingPlan; planAfter: BillingPlanId; firstDueDate: string },
) {
  const { holder, email } = await payerOf(input.tenantId);
  const checkout = {
    itemName: planDescription(input.charged.id),
    description: `Plano ${input.charged.name}, todo mês no cartão`,
    valueCents: input.charged.priceCents,
    firstDueDate: input.firstDueDate,
    externalReference: input.tenantId,
    successUrl: returnUrl("sucesso"),
    cancelUrl: returnUrl("cancelado"),
  };
  const created = await createCheckout(client, checkout, checkoutPayer(holder, email));
  await saveBillingAccount(database, input.tenantId, {
    pendingPlan: input.planAfter,
    pendingReference: `${CHECKOUT_REFERENCE}${created.checkoutId}`,
  });
  if (created.url === null) throw validationError("Não foi possível abrir o pagamento agora.");
  return { url: created.url };
}

/** The payer's data fills the page when Asaas accepts it; otherwise its page asks for it. */
async function createCheckout(
  client: AsaasBillingClient,
  checkout: Omit<Parameters<AsaasBillingClient["createRecurringCheckout"]>[0], "payer">,
  payer: AsaasCheckoutPayer | null,
) {
  if (payer === null) return client.createRecurringCheckout({ ...checkout, payer: null });
  try {
    return await client.createRecurringCheckout({ ...checkout, payer });
  } catch (error) {
    if (!isAsaasError(error) || error.status !== 400) throw error;
    logger.info("billing.checkout_prefill_refused", { codes: error.codes });
    return client.createRecurringCheckout({ ...checkout, payer: null });
  }
}

/** The first subscription: Pix paid every month, or a card that renews by itself. */
export async function startSubscription(input: {
  tenantId: string;
  userId: string;
  plan: BillingPlanId;
  method: BillingPaymentMethod;
}) {
  await requireBillingOwner(database, input.tenantId, input.userId);
  const client = billingClient();
  const plan = billingPlan(input.plan);
  return withBillingLock(input.tenantId, async () => {
    const account = await getBillingAccount(database, input.tenantId);
    if (account !== null && isLive(account)) {
      throw conflictError("Você já tem um plano. Para trocar, use o botão do plano que você quer.");
    }
    if (account !== null) await retireUnpaid(client, account);
    if (input.method === "pix") {
      return openPixSubscription(client, { tenantId: input.tenantId, account, plan });
    }
    const prepaidUntil = paidMonthLeft(account);
    const firstDueDate =
      prepaidUntil === null
        ? asaasDueDate(new Date(), 0)
        : asaasDueDate(new Date(prepaidUntil.getTime() - DAY_IN_MS), 0);
    return openCardCheckout(client, {
      tenantId: input.tenantId,
      charged: plan,
      planAfter: plan.id,
      firstDueDate,
    });
  });
}

async function planChangeFor(
  client: AsaasBillingClient,
  account: BillingAccount,
  plan: BillingPlanId,
) {
  if (account.subscriptionId === null || !isBillingPlanId(account.plan)) {
    throw conflictError("Você ainda não tem uma assinatura ativa.");
  }
  const { state } = await readSubscriptionState(client, {
    subscriptionId: account.subscriptionId,
    prepaidUntil: account.prepaidUntil,
  });
  return planChangeOf({
    current: billingPlan(account.plan),
    target: billingPlan(plan),
    scheduledPlan: account.scheduledPlan,
    paidPeriod: state.paidPeriod,
    now: new Date(),
  });
}

/** What switching to `plan` costs or when it starts, before the reseller confirms. */
export async function quotePlanChange(input: {
  tenantId: string;
  userId: string;
  plan: BillingPlanId;
}) {
  await requireBillingOwner(database, input.tenantId, input.userId);
  const client = billingClient();
  const account = await liveAccount(input.tenantId);
  try {
    return planChangeView(await planChangeFor(client, account, input.plan));
  } catch (error) {
    if (!isAsaasError(error)) throw error;
    throw new AppError("EXTERNAL_PROVIDER", UNREACHABLE_MESSAGE, { cause: error });
  }
}

function planChangeView(change: PlanChange) {
  if (change.kind === "schedule")
    return { kind: change.kind, startsAt: change.startsAt.toISOString() };
  if (change.kind === "upgrade_pay") {
    return {
      kind: change.kind,
      differenceCents: change.differenceCents,
      until: change.until.toISOString(),
    };
  }
  return { kind: change.kind };
}

async function applyPlanChange(
  client: AsaasBillingClient,
  input: { tenantId: string; account: BillingAccount; plan: BillingPlan; change: PlanChange },
): Promise<{ url: string | null }> {
  const { tenantId, account, plan, change } = input;
  if (change.kind === "keep" || account.subscriptionId === null) return { url: null };
  if (change.kind === "upgrade_pay")
    return openUpgradeCharge(client, { tenantId, account, plan, change });
  const current = isBillingPlanId(account.plan) ? billingPlan(account.plan) : plan;
  const charged = change.kind === "cancel_schedule" ? current : plan;
  await client.changeSubscriptionValue(account.subscriptionId, {
    valueCents: charged.priceCents,
    description: planDescription(charged.id),
  });
  if (change.kind === "schedule") {
    await saveBillingAccount(database, tenantId, {
      scheduledPlan: plan.id,
      scheduledPlanAt: change.startsAt,
    });
    return { url: null };
  }
  const now = change.kind === "upgrade_now" ? { plan: plan.id } : {};
  await saveBillingAccount(database, tenantId, {
    ...now,
    scheduledPlan: null,
    scheduledPlanAt: null,
  });
  return { url: null };
}

async function openUpgradeCharge(
  client: AsaasBillingClient,
  input: {
    tenantId: string;
    account: BillingAccount;
    plan: BillingPlan;
    change: Extract<PlanChange, { kind: "upgrade_pay" }>;
  },
) {
  const { tenantId, account, plan, change } = input;
  if (account.customerId === null) throw conflictError("Você ainda não tem uma assinatura ativa.");
  await retireUnpaid(client, { ...account, subscriptionId: null });
  const charge = await client.createOneOffCharge({
    customerId: account.customerId,
    billingType: account.paymentMethod === "credit_card" ? "CREDIT_CARD" : "PIX",
    valueCents: change.differenceCents,
    dueDate: asaasDueDate(new Date(), 0),
    description: `Diferença para o plano ${plan.name} até ${dayLabel(change.until)}`,
    externalReference: `upgrade:${tenantId}`,
    successUrl: returnUrl("troca"),
  });
  await saveBillingAccount(database, tenantId, {
    pendingPlan: plan.id,
    pendingReference: `${CHARGE_REFERENCE}${charge.id}`,
  });
  if (charge.invoiceUrl == null) throw validationError("Não foi possível abrir o pagamento agora.");
  return { url: charge.invoiceUrl };
}

/**
 * Moves an active subscription to another plan: a bigger one now (after paying the difference
 * for the rest of the month, when it reaches Asaas's minimum), a smaller one at the next charge.
 */
export async function changePlan(input: { tenantId: string; userId: string; plan: BillingPlanId }) {
  await requireBillingOwner(database, input.tenantId, input.userId);
  const client = billingClient();
  const plan = billingPlan(input.plan);
  return withBillingLock(input.tenantId, async () => {
    const account = await liveAccount(input.tenantId);
    const change = await planChangeFor(client, account, input.plan);
    return applyPlanChange(client, { tenantId: input.tenantId, account, plan, change });
  });
}

/** The Asaas page of what is waiting for payment: an upgrade difference or the monthly fee. */
export async function openPendingPayment(input: { tenantId: string; userId: string }) {
  await requireBillingOwner(database, input.tenantId, input.userId);
  const client = billingClient();
  return withBillingLock(input.tenantId, async () => {
    const account = await getBillingAccount(database, input.tenantId);
    const reference = account?.pendingReference ?? null;
    if (reference?.startsWith(CHARGE_REFERENCE) === true) {
      const charge = await client.getCharge(reference.slice(CHARGE_REFERENCE.length));
      if (charge.invoiceUrl != null && charge.status !== "RECEIVED")
        return { url: charge.invoiceUrl };
    }
    if (account?.subscriptionId == null) throw validationError("Não há pagamento em aberto agora.");
    const { state } = await readSubscriptionState(client, {
      subscriptionId: account.subscriptionId,
      prepaidUntil: account.prepaidUntil,
    });
    if (state.openCharge?.invoiceUrl == null)
      throw validationError("Não há pagamento em aberto agora.");
    return { url: state.openCharge.invoiceUrl };
  });
}

/**
 * Pix from the next charge on, on the same subscription; or a new card (also replacing one),
 * through a checkout whose subscription starts charging when the paid month ends.
 */
export async function changePaymentMethod(input: {
  tenantId: string;
  userId: string;
  method: BillingPaymentMethod;
}) {
  await requireBillingOwner(database, input.tenantId, input.userId);
  const client = billingClient();
  return withBillingLock(input.tenantId, async () => {
    const account = await liveAccount(input.tenantId);
    if (account.subscriptionId === null || !isBillingPlanId(account.plan)) {
      throw conflictError("Você ainda não tem uma assinatura ativa.");
    }
    if (input.method === "pix") {
      if (account.paymentMethod === "pix") throw conflictError("Você já paga com Pix.");
      await client.switchSubscriptionToPix(account.subscriptionId);
      await saveBillingAccount(database, input.tenantId, { paymentMethod: "pix" });
      return { url: null };
    }
    const { state } = await readSubscriptionState(client, {
      subscriptionId: account.subscriptionId,
      prepaidUntil: account.prepaidUntil,
    });
    if (state.paidPeriod === null)
      throw conflictError("Pague a primeira mensalidade antes de trocar o cartão.");
    await retireUnpaid(client, { ...account, subscriptionId: null });
    const nextDue = state.paidPeriod.end;
    // The new card pays from the next charge, which already has a scheduled smaller plan's price.
    const scheduledPlan = account.scheduledPlan;
    const chargedId =
      scheduledPlan !== null && isBillingPlanId(scheduledPlan) ? scheduledPlan : account.plan;
    const charged = billingPlan(chargedId);
    return openCardCheckout(client, {
      tenantId: input.tenantId,
      charged,
      planAfter: account.plan,
      firstDueDate: asaasDueDate(nextDue, 0),
    });
  });
}

/** Ends the subscription: the paid month runs out and nothing renews. */
export async function cancelSubscription(input: { tenantId: string; userId: string }) {
  await requireBillingOwner(database, input.tenantId, input.userId);
  const client = billingClient();
  return withBillingLock(input.tenantId, async () => {
    const account = await getBillingAccount(database, input.tenantId);
    if (account?.subscriptionId == null || account.cancelAtPeriodEnd) {
      throw conflictError("Você não tem uma assinatura ativa para cancelar.");
    }
    await retireUnpaid(client, { ...account, subscriptionId: null });
    await client.deleteSubscription(account.subscriptionId);
    await saveBillingAccount(database, input.tenantId, {
      cancelAtPeriodEnd: true,
      scheduledPlan: null,
      scheduledPlanAt: null,
      pendingPlan: null,
      pendingReference: null,
      ...(account.status === "incomplete" ? { status: "canceled" } : {}),
    });
    return { endsAt: account.periodEnd?.toISOString() ?? null };
  });
}
