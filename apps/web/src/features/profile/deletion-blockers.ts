import type { DeletionBlockers, HeldMoney } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { formatDeadlineDay } from "@/lib/relative-time";

/** One thing left to resolve before the account can go, and the page where it is resolved. */
export interface DeletionBlockerLine {
  text: string;
  /** An app path carrying the profile (`?perfil=`). */
  href: string;
}

interface BlockerProfile {
  slug: string;
  kind: ProfileKind;
}

const SELLER_ORDERS_PAGE = "/pedidos";
const SUPPLIER_ORDERS_PAGE = "/fornecedor/painel/pedidos";
const SUPPLIER_MONEY_PAGE = "/fornecedor/painel/recebimentos";
const RETURNS_PAGE = "/suporte";

function counted(amount: number, singular: string, plural: string): string {
  return `${amount} ${amount === 1 ? singular : plural}`;
}

function releaseOf(money: HeldMoney, now: Date): string {
  if (money.awaitingDelivery > 0 || money.lastReleaseAt === null) {
    return "libera 7 dias depois da entrega";
  }
  return `libera até ${formatDeadlineDay(money.lastReleaseAt, now)}`;
}

interface Candidate {
  amount: number;
  text: string;
  /** The page, before the profile is added. */
  path: string;
}

function orderCandidates(blockers: DeletionBlockers): Candidate[] {
  return [
    {
      amount: blockers.ordersToShip,
      text: counted(blockers.ordersToShip, "pedido para enviar", "pedidos para enviar"),
      path: SELLER_ORDERS_PAGE,
    },
    {
      amount: blockers.ordersOnTheWay,
      text: counted(
        blockers.ordersOnTheWay,
        "pedido a caminho do comprador",
        "pedidos a caminho do comprador",
      ),
      path: SELLER_ORDERS_PAGE,
    },
    {
      amount: blockers.parcelsToShip,
      text: counted(blockers.parcelsToShip, "pacote para enviar", "pacotes para enviar"),
      path: SUPPLIER_ORDERS_PAGE,
    },
    {
      amount: blockers.parcelsOnTheWay,
      text: counted(
        blockers.parcelsOnTheWay,
        "pacote a caminho do comprador",
        "pacotes a caminho do comprador",
      ),
      path: SUPPLIER_ORDERS_PAGE,
    },
  ];
}

function moneyCandidates(blockers: DeletionBlockers, kind: ProfileKind, now: Date): Candidate[] {
  const held = blockers.sellerMoneyHeld;
  const toReceive = blockers.supplierMoneyToReceive;
  return [
    {
      amount: blockers.paymentsInProgress,
      text: counted(
        blockers.paymentsInProgress,
        "pagamento em andamento",
        "pagamentos em andamento",
      ),
      path: kind === "supplier" ? SUPPLIER_MONEY_PAGE : SELLER_ORDERS_PAGE,
    },
    {
      amount: held.count,
      text: `${formatCents(held.amountCents)} pagos a fornecedores e ainda retidos (${releaseOf(held, now)})`,
      path: SELLER_ORDERS_PAGE,
    },
    {
      amount: toReceive.count,
      text: `${formatCents(toReceive.amountCents)} a receber (${releaseOf(toReceive, now)})`,
      path: SUPPLIER_MONEY_PAGE,
    },
    {
      amount: blockers.returnsInReview,
      text: counted(blockers.returnsInReview, "devolução em análise", "devoluções em análise"),
      path: RETURNS_PAGE,
    },
  ];
}

/** What is left to resolve in one profile, in the words the deletion screen shows. */
export function describeDeletionBlockers(
  blockers: DeletionBlockers,
  input: { profile: BlockerProfile; now: Date },
): DeletionBlockerLine[] {
  const { profile, now } = input;
  return [...orderCandidates(blockers), ...moneyCandidates(blockers, profile.kind, now)]
    .filter((candidate) => candidate.amount > 0)
    .map((candidate) => ({
      text: candidate.text,
      href: `${candidate.path}?perfil=${encodeURIComponent(profile.slug)}`,
    }));
}
