/**
 * Branded layout for transactional e-mails. Table markup and inline styles because e-mail
 * clients (Gmail, Outlook) drop <style> blocks, flexbox and SVG; the plain-text part is kept
 * for clients that do not render HTML.
 */

const BRAND = {
  pine: "#032621",
  ink: "#032621",
  inkSoft: "#3d5e58",
  mist: "#f4f4f4",
  sage: "#e3ebe9",
  leaf: "#007a4d",
} as const;

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface ActionEmailContent {
  readonly subject: string;
  /** Inbox preview line shown next to the subject. */
  readonly preview: string;
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly actionLabel: string;
  readonly actionUrl: string;
  /** Small print under the button, e.g. why the reader got the e-mail. */
  readonly footnote: string;
}

export interface RenderedEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderText(content: ActionEmailContent): string {
  return [
    content.heading,
    "",
    ...content.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    `${content.actionLabel}: ${content.actionUrl}`,
    "",
    content.footnote,
    "",
    "SellBridge",
  ].join("\n");
}

function renderHeader(appUrl: string): string {
  const logoUrl = escapeHtml(new URL("/brand/sellbridge-email-logo.png", appUrl).toString());
  return `<tr><td style="padding:32px 40px 8px 40px;">
<img src="${logoUrl}" width="160" height="40" alt="SellBridge" style="display:block;border:0;outline:none;height:40px;width:160px;">
</td></tr>`;
}

function renderButton(label: string, url: string): string {
  const href = escapeHtml(url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;"><tr>
<td style="border-radius:999px;background:${BRAND.pine};">
<a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT_STACK};font-size:16px;font-weight:700;line-height:20px;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(label)}</a>
</td></tr></table>`;
}

function renderBody(content: ActionEmailContent): string {
  const paragraphs = content.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:${BRAND.ink};">${escapeHtml(paragraph)}</p>`,
    )
    .join("\n");
  const href = escapeHtml(content.actionUrl);
  return `<tr><td style="padding:16px 40px 32px 40px;font-family:${FONT_STACK};">
<h1 style="margin:0 0 16px 0;font-size:24px;line-height:32px;font-weight:700;color:${BRAND.ink};">${escapeHtml(content.heading)}</h1>
${paragraphs}
${renderButton(content.actionLabel, content.actionUrl)}
<p style="margin:0 0 8px 0;font-size:13px;line-height:20px;color:${BRAND.inkSoft};">Se o botão não funcionar, copie e cole este endereço no navegador:</p>
<p style="margin:0 0 24px 0;font-size:13px;line-height:20px;word-break:break-all;"><a href="${href}" target="_blank" style="color:${BRAND.leaf};text-decoration:underline;">${href}</a></p>
<p style="margin:0;padding-top:20px;border-top:1px solid ${BRAND.sage};font-size:13px;line-height:20px;color:${BRAND.inkSoft};">${escapeHtml(content.footnote)}</p>
</td></tr>`;
}

function renderFooter(): string {
  return `<tr><td style="padding:24px 40px;font-family:${FONT_STACK};font-size:12px;line-height:18px;color:${BRAND.inkSoft};text-align:center;">
SellBridge · A ponte entre os atacadistas de todo o Brasil e as suas lojas.<br>
Este é um e-mail automático; respostas não são lidas.
</td></tr>`;
}

function renderHtml(content: ActionEmailContent, appUrl: string): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escapeHtml(content.subject)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.mist};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.mist};"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;">
${renderHeader(appUrl)}
${renderBody(content)}
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
${renderFooter()}
</table>
</td></tr></table>
</body></html>`;
}

export function renderActionEmail(content: ActionEmailContent, appUrl: string): RenderedEmail {
  return {
    subject: content.subject,
    text: renderText(content),
    html: renderHtml(content, appUrl),
  };
}
