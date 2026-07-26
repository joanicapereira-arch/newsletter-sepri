// Renders the final Brevo-ready HTML in the SEPRI newsletter visual language:
// dark navy hero with a small teal kicker ribbon and large white H1, a solid
// cyan intro block with bold lead, and white body sections with a green emoji
// prefix on each teal-coloured heading, bullet lists, grouped subsections and
// a highlighted "Orientações" box when the source has clear instructions.

export interface NewsletterSubsection {
  heading: string;
  paragraph?: string;
  bullets?: string[];
}

export interface NewsletterSection {
  icon?: string; // emoji/icon character
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  subsections?: NewsletterSubsection[];
}

export interface NewsletterGuidelines {
  heading: string;
  intro?: string;
  items: string[];
}

export interface NewsletterCta {
  label: string;
  url?: string;
}

export interface NewsletterItemContent {
  overtitle?: string; // kicker ribbon text
  title: string; // big H1
  subtitle?: string;
  intro_paragraphs: string[]; // shown in cyan block (first paragraph rendered bold)
  sections: NewsletterSection[];
  guidelines?: NewsletterGuidelines;
  closing_paragraph?: string;
  cta?: NewsletterCta;
  source_name?: string;
  source_url?: string | null;
  published_at?: string | null;
}

export interface NewsletterDocument {
  subject: string;
  composite_intro?: {
    overtitle?: string;
    title: string;
    lead: string;
  };
  items: NewsletterItemContent[];
  cta?: NewsletterCta;
}

export interface NewsletterChrome {
  logoUrl: string;
  disclaimerHtml: string;
}

// SEPRI visual palette
const NAVY = "#0f2c52";
const CYAN = "#7ec7d6";
const RIBBON = "#a5d8e0";
const RIBBON_INK = "#0f2c52";
const TEAL = "#0f5e8f";
const INK = "#0f172a";
const MUTED = "#64748b";
const BODY = "#334155";
const BORDER = "#e2e8f0";
const HIGHLIGHT_BG = "#f0f7fb";

export function renderNewsletterHtml(doc: NewsletterDocument, chrome: NewsletterChrome): string {
  const isComposite = !!doc.composite_intro;

  const heroBlock = isComposite && doc.composite_intro
    ? renderHero({
        overtitle: doc.composite_intro.overtitle,
        title: doc.composite_intro.title,
      })
    : renderHero({
        overtitle: doc.items[0]?.overtitle,
        title: doc.items[0]?.title ?? "",
        subtitle: doc.items[0]?.subtitle,
      });

  const introBlock = isComposite && doc.composite_intro
    ? renderIntroBlock([doc.composite_intro.lead])
    : renderIntroBlock(doc.items[0]?.intro_paragraphs ?? []);

  const bodyBlock = isComposite
    ? doc.items.map((it, idx) => renderCompositeItem(it, idx)).join("\n")
    : renderItemBody(doc.items[0]);

  return `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(doc.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:${INK};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;overflow:hidden;">
      <tr><td style="padding:28px 32px 20px 32px;text-align:center;background:#ffffff;">
        <img src="${esc(chrome.logoUrl)}" alt="SEPRI Group" style="max-height:64px;height:auto;display:inline-block;" />
      </td></tr>
      ${heroBlock}
      ${introBlock}
      <tr><td style="padding:32px 40px;background:#ffffff;">
        ${bodyBlock}
        ${doc.cta ? renderCta(doc.cta) : (!isComposite && doc.items[0]?.cta ? "" : "")}
      </td></tr>
      <tr><td style="padding:24px 32px;background:${NAVY};color:#ffffff;">
        <p style="margin:0 0 6px;font-size:15px;font-weight:700;letter-spacing:0.5px;">SEPRI — Medicina no Trabalho, Lda.</p>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#cbd5e1;">
          Avenida da Igreja nº42, 1 Dto, 1700-239 Lisboa · Rua Dr Loureiro Amorim nº183, 4710-487 Braga<br/>
          <a href="https://www.sepri.pt" style="color:#a5d8e0;text-decoration:none;">www.sepri.pt</a> · <a href="mailto:comunicacao@sepri.pt" style="color:#a5d8e0;text-decoration:none;">comunicacao@sepri.pt</a>
        </p>
      </td></tr>
      <tr><td style="padding:16px 32px;background:#f1f5f9;border-top:1px solid ${BORDER};">
        ${chrome.disclaimerHtml}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function renderCta(cta: NewsletterCta): string {
  const href = cta.url ?? "https://www.sepri.pt/contactos";
  return `<div style="margin:36px 0 8px;text-align:center;">
    <a href="${esc(href)}" style="display:inline-block;background:${NAVY};color:#ffffff;text-decoration:none;padding:16px 34px;border-radius:4px;font-size:14px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">${esc(cta.label)}</a>
  </div>`;
}

function renderHero(opts: { overtitle?: string; title: string; subtitle?: string }): string {
  const ribbon = opts.overtitle
    ? `<div style="display:inline-block;background:${RIBBON};color:${RIBBON_INK};padding:6px 18px;border-radius:2px;font-size:12px;letter-spacing:2.5px;font-weight:700;text-transform:uppercase;margin-bottom:16px;">${esc(opts.overtitle)}</div>`
    : "";
  const subtitle = opts.subtitle
    ? `<p style="margin:14px 0 0;font-size:18px;line-height:1.4;color:#e2e8f0;font-weight:400;">${esc(opts.subtitle)}</p>`
    : "";
  return `<tr><td style="padding:44px 40px;background:${NAVY};text-align:center;">
    ${ribbon}
    <h1 style="margin:0;font-size:28px;line-height:1.25;color:#ffffff;font-weight:800;letter-spacing:-0.3px;">${esc(opts.title)}</h1>
    ${subtitle}
  </td></tr>`;
}

function renderIntroBlock(paragraphs: string[]): string {
  if (!paragraphs.length) return "";
  const [first, ...rest] = paragraphs;
  const firstHtml = `<p style="margin:0 0 14px;font-size:17px;line-height:1.5;color:#ffffff;font-weight:700;text-align:center;">${esc(first)}</p>`;
  const restHtml = rest
    .map(
      (p) =>
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:#ffffff;text-align:center;">${esc(p)}</p>`,
    )
    .join("");
  return `<tr><td style="padding:36px 48px;background:${CYAN};">
    ${firstHtml}${restHtml}
  </td></tr>`;
}

function renderItemBody(item: NewsletterItemContent | undefined): string {
  if (!item) return "";
  const sections = (item.sections ?? []).map(renderSection).join("\n");
  const guidelines = item.guidelines ? renderGuidelines(item.guidelines) : "";
  const closing = item.closing_paragraph
    ? `<p style="font-size:15px;line-height:1.7;color:${BODY};margin:28px 0 0;">${fmt(item.closing_paragraph)}</p>`
    : "";
  const cta = item.cta ? renderCta(item.cta) : "";
  const sourceLine = renderSourceLine(item);
  return `${sections}${guidelines}${closing}${cta}${sourceLine}`;
}

function renderCompositeItem(item: NewsletterItemContent, idx: number): string {
  const sep =
    idx > 0
      ? `<div style="margin:36px 0;border-top:2px solid ${BORDER};"></div>`
      : "";
  const kicker = item.overtitle
    ? `<div style="display:inline-block;background:${RIBBON};color:${RIBBON_INK};padding:4px 14px;border-radius:2px;font-size:11px;letter-spacing:2px;font-weight:700;text-transform:uppercase;margin-bottom:12px;">${esc(item.overtitle)}</div>`
    : "";
  const title = `<h2 style="margin:0 0 8px;font-size:22px;line-height:1.3;color:${NAVY};font-weight:800;">${esc(item.title)}</h2>`;
  const subtitle = item.subtitle
    ? `<p style="margin:0 0 14px;font-size:16px;line-height:1.45;color:${TEAL};font-weight:600;">${esc(item.subtitle)}</p>`
    : "";
  const intro = (item.intro_paragraphs ?? [])
    .map(
      (p) =>
        `<p style="font-size:15px;line-height:1.7;color:${BODY};margin:0 0 14px;">${fmt(p)}</p>`,
    )
    .join("");
  const sections = (item.sections ?? []).map(renderSection).join("\n");
  const guidelines = item.guidelines ? renderGuidelines(item.guidelines) : "";
  const closing = item.closing_paragraph
    ? `<p style="font-size:15px;line-height:1.7;color:${BODY};margin:24px 0 0;">${fmt(item.closing_paragraph)}</p>`
    : "";
  const cta = item.cta ? renderCta(item.cta) : "";
  const sourceLine = renderSourceLine(item);

  return `${sep}<div>${kicker}${title}${subtitle}${intro}${sections}${guidelines}${closing}${cta}${sourceLine}</div>`;
}

function renderSourceLine(item: NewsletterItemContent): string {
  const pub = item.published_at
    ? `Publicado em ${esc(new Date(item.published_at).toLocaleDateString("pt-PT"))}`
    : "";
  const src = item.source_name ? `Fonte: ${esc(item.source_name)}` : "";
  const line = [pub, src].filter(Boolean).join(" · ");
  const link = item.source_url
    ? ` — <a href="${esc(item.source_url)}" style="color:${TEAL};text-decoration:underline;">Ler na fonte original →</a>`
    : "";
  if (!line && !link) return "";
  return `<p style="font-size:13px;color:${MUTED};margin:24px 0 0;">${line}${link}</p>`;
}

function renderSection(section: NewsletterSection): string {
  const icon = section.icon ? `<span style="margin-right:10px;">${esc(section.icon)}</span>` : "🌿 ";
  const heading = `<h3 style="font-size:18px;line-height:1.35;margin:28px 0 14px;color:${TEAL};font-weight:800;">${icon}${esc(section.heading)}</h3>`;

  const paragraphs = (section.paragraphs ?? [])
    .map(
      (p) =>
        `<p style="font-size:15px;line-height:1.7;color:${BODY};margin:0 0 12px;">${esc(p)}</p>`,
    )
    .join("");

  const bullets =
    section.bullets && section.bullets.length ? renderBullets(section.bullets) : "";

  const subs = (section.subsections ?? [])
    .map((sub) => {
      const subBullets = sub.bullets && sub.bullets.length ? renderBullets(sub.bullets) : "";
      const subPara = sub.paragraph
        ? `<p style="font-size:15px;line-height:1.7;color:${BODY};margin:0 0 8px;">${esc(sub.paragraph)}</p>`
        : "";
      return `<div style="margin:14px 0 4px;">
        <p style="font-size:15px;line-height:1.5;color:${INK};font-weight:700;margin:0 0 6px;">${esc(sub.heading)}</p>
        ${subPara}${subBullets}
      </div>`;
    })
    .join("");

  return `${heading}${paragraphs}${bullets}${subs}`;
}

function renderBullets(items: string[]): string {
  const li = items
    .map(
      (b) =>
        `<li style="font-size:15px;line-height:1.65;color:${BODY};margin:0 0 6px;">${esc(b)}</li>`,
    )
    .join("");
  return `<ul style="margin:0 0 14px 22px;padding:0;">${li}</ul>`;
}

function renderGuidelines(g: NewsletterGuidelines): string {
  const intro = g.intro
    ? `<p style="font-size:15px;line-height:1.65;color:${BODY};margin:0 0 12px;">${esc(g.intro)}</p>`
    : "";
  const items = g.items
    .map(
      (it) =>
        `<li style="font-size:15px;line-height:1.65;color:${INK};margin:0 0 8px;padding-left:6px;list-style:none;position:relative;"><span style="color:${TEAL};font-weight:700;margin-right:8px;">✓</span>${esc(it)}</li>`,
    )
    .join("");
  return `<div style="margin:28px 0 8px;padding:22px 24px;background:${HIGHLIGHT_BG};border-left:4px solid ${TEAL};border-radius:6px;">
    <div style="display:inline-block;background:${TEAL};color:#ffffff;padding:4px 12px;border-radius:2px;font-size:11px;letter-spacing:2px;font-weight:700;text-transform:uppercase;margin-bottom:10px;">Orientações</div>
    <h4 style="font-size:17px;line-height:1.35;margin:0 0 10px;color:${NAVY};font-weight:800;">${esc(g.heading)}</h4>
    ${intro}
    <ul style="margin:0;padding:0;list-style:none;">${items}</ul>
  </div>`;
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
