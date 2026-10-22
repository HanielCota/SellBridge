import type { z } from "zod";
import { findContactDetails } from "../domain/contact-detection.ts";

export { type ContactKind, findContactDetails } from "../domain/contact-detection.ts";

/** Marks the issue, so the server can log the attempt (field and kind, never the text). */
export const CONTACT_DETAILS_REASON = "contact_details";

export const CONTACT_DETAILS_REFUSED =
  "Por segurança, telefone, e-mail e redes sociais não podem ser enviados por aqui. Converse pelas mensagens do pedido.";

/** Sites that open a chat, a profile or a short link to either, by their exact host. */
const CONTACT_HOSTS = new Set([
  "wa.me",
  "wa.link",
  "t.me",
  "t.co",
  "x.com",
  "is.gd",
  "ow.ly",
  "rb.gy",
  "goo.gl",
]);

/** Any part of the host naming one of these is a chat, a profile or a link shortener. */
const CONTACT_HOST_LABELS = new Set([
  "whatsapp",
  "telegram",
  "instagram",
  "instagr",
  "facebook",
  "fb",
  "tiktok",
  "kwai",
  "twitter",
  "threads",
  "youtube",
  "youtu",
  "linktr",
  "linkedin",
  "lnkd",
  "discord",
  "messenger",
  "bit",
  "tinyurl",
  "cutt",
]);

/** A query or path asking for a phone: "?tel=…", "/whats/…". */
const PHONE_PARAMETER = /(?:tel|phone|fone|celular|whats|zap|wpp)[=:/]/i;

function contactHost(hostname: string): boolean {
  // A final dot ("wa.me.") names the same site.
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return CONTACT_HOSTS.has(host) || host.split(".").some((label) => CONTACT_HOST_LABELS.has(label));
}

function decoded(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    // A broken escape: read it as typed.
    return text;
  }
}

/**
 * Whether a link would hand the other side a way to talk outside SellBridge: a chat, profile or
 * short-link host, or a contact in its path or query. Phone-looking numbers in the path are
 * allowed (carrier tracking pages have long numeric ids) unless a parameter asks for a phone.
 */
function contactLink(url: URL): boolean {
  const rest = decoded(`${url.pathname}${url.search}${url.hash}`);
  const kinds = findContactDetails(rest).filter((kind) => kind !== "phone");
  return contactHost(url.hostname) || kinds.length > 0 || PHONE_PARAMETER.test(rest);
}

/**
 * Refuses free text that carries a phone, e-mail, chat link or social network user. Reseller
 * and supplier must not be able to reach each other outside the platform (the user's rule).
 */
export function refuseContactDetails(text: string, context: z.RefinementCtx): void {
  const kinds = findContactDetails(text);
  if (kinds.length === 0) {
    return;
  }
  context.addIssue({
    code: "custom",
    message: CONTACT_DETAILS_REFUSED,
    params: { reason: CONTACT_DETAILS_REASON, kinds },
  });
}

/** The same for a link field, where links are expected: only chat and profile hosts are refused. */
export function refuseContactLink(url: string, context: z.RefinementCtx): void {
  if (!URL.canParse(url) || !contactLink(new URL(url))) {
    return;
  }
  context.addIssue({
    code: "custom",
    message: CONTACT_DETAILS_REFUSED,
    params: { reason: CONTACT_DETAILS_REASON, kinds: ["link"] },
  });
}
