// Renders the final Brevo-ready HTML wrapper from an AI-generated body.
export interface NewsletterParts {
  subject: string;
  title: string;
  lead: string;
  bodyHtml: string; // already-sanitised AI HTML (paragraphs)
  imagePlaceholder?: string; // optional URL
  sourceUrl?: string;
  publishedAt?: string; // ISO date (YYYY-MM-DD)
  composite?: boolean; // when true, suppress single-item header (title/lead/image/source)
}

export interface NewsletterChrome {
  logoUrl: string;
  disclaimerHtml: string;
}

export function renderNewsletterHtml(parts: NewsletterParts, chrome: NewsletterChrome): string {
  const composite = parts.composite === true;
  const img = composite
    ? ""
    : parts.imagePlaceholder
    ? `<img src="${esc(parts.imagePlaceholder)}" alt="${esc(parts.title)}" style="width:100%;max-width:600px;height:auto;display:block;border-radius:6px;margin:24px 0;" />`
    : `<div style="background:#f3f4f6;border:1px dashed #cbd5e1;border-radius:6px;padding:48px;text-align:center;color:#94a3b8;font-family:Arial,sans-serif;margin:24px 0;">[ Inserir aqui imagem ou vídeo ilustrativo ]</div>`;

  const publishedLine = !composite && parts.publishedAt
    ? `<p style="font-size:13px;color:#64748b;margin:0 0 16px;">Publicado em ${esc(new Date(parts.publishedAt).toLocaleDateString("pt-PT"))}</p>`
    : "";
  const sourceLink = !composite && parts.sourceUrl
    ? `<p style="font-size:13px;color:#64748b;margin-top:24px;">Fonte: <a href="${esc(parts.sourceUrl)}" style="color:#0f5e8f;">${esc(parts.sourceUrl)}</a></p>`
    : "";
  const headBlock = composite
    ? ""
    : `<h1 style="font-size:24px;line-height:1.3;margin:0 0 8px;color:#0f172a;">${esc(parts.title)}</h1>
        ${publishedLine}
        <p style="font-size:17px;line-height:1.55;font-weight:600;color:#0f5e8f;margin:0 0 8px;">${esc(parts.lead)}</p>
        ${img}`;

  return `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(parts.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
      <tr><td style="padding:24px 32px;border-bottom:1px solid #e2e8f0;text-align:center;">
        <img src="${esc(chrome.logoUrl)}" alt="SEPRI Group" style="max-height:60px;height:auto;display:inline-block;" />
      </td></tr>
      <tr><td style="padding:32px;">
        <h1 style="font-size:24px;line-height:1.3;margin:0 0 8px;color:#0f172a;">${esc(parts.title)}</h1>
        ${publishedLine}
        <p style="font-size:17px;line-height:1.55;font-weight:600;color:#0f5e8f;margin:0 0 8px;">${esc(parts.lead)}</p>
        ${img}
        <div style="font-size:15px;line-height:1.65;color:#1e293b;">${parts.bodyHtml}</div>
        ${sourceLink}
      </td></tr>
      <tr><td style="padding:20px 32px;background:#f1f5f9;border-top:1px solid #e2e8f0;">
        ${chrome.disclaimerHtml}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
