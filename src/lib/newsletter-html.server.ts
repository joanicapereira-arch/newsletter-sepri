import { SOCIAL_ICON_DATA_URIS } from "./social-icons.data";

// SEPRI newsletter renderer — matches the reference template exactly:
// (1) centered logo, (2) navy hero with icon + turquoise tag + white H1,
// (3) turquoise intro block with white bold lead + supporting text,
// (4) white body with emoji-prefixed H2 + bullet lists,
// (5) rounded navy CTA button,
// (6) fixed footer (contacts) + configurable disclaimer.

export interface NewsletterSubsection {
  heading: string;
  paragraph?: string;
  bullets?: string[];
}

export interface NewsletterSection {
  icon?: string;
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

export interface NewsletterResource {
  heading: string;
  imageUrl?: string;
  linkUrl?: string;
}

export interface NewsletterItemContent {
  overtitle?: string;
  title: string;
  subtitle?: string;
  intro_paragraphs: string[];
  sections: NewsletterSection[];
  guidelines?: NewsletterGuidelines;
  resource?: NewsletterResource;
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

// Reference palette
const NAVY = "#1a3a63";
const TURQ = "#7ec8d8";
const INK = "#2b2b2b";
const MUTED = "#4a4a4a";
const LIGHT_BG = "#eef1f4";
const BORDER = "#d5dbe0";
const PAGE_BG = "#e5e9ed";

export function renderNewsletterHtml(doc: NewsletterDocument, chrome: NewsletterChrome): string {
  const isComposite = !!doc.composite_intro;

  const heroTag = isComposite
    ? doc.composite_intro?.overtitle
    : doc.items[0]?.overtitle;
  const heroTitle = isComposite
    ? doc.composite_intro?.title ?? ""
    : doc.items[0]?.title ?? "";
  const heroIcon = pickHeroIcon(heroTag, heroTitle);

  const introParas = isComposite
    ? doc.composite_intro
      ? [doc.composite_intro.lead]
      : []
    : doc.items[0]?.intro_paragraphs ?? [];

  const bodyBlock = isComposite
    ? doc.items.map(renderCompositeItem).join("\n")
    : renderItemBody(doc.items[0]);

  const finalCta = doc.cta ?? (!isComposite ? doc.items[0]?.cta : undefined);
  const highlightRows = doc.items
    .map((it) => it.resource)
    .filter((r): r is NewsletterResource => !!r)
    .map(renderHighlightBlock)
    .join("\n");

  return `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(doc.subject)}</title>
<style>
  @media print {
    html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #ffffff !important; }
    body { padding: 0 !important; }
  }
</style>
</head>
<body style="margin:0;padding:40px 0;background:${PAGE_BG};font-family:Arial,Helvetica,sans-serif;color:${INK};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG};">
  <tr><td align="center">
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;">
      <!-- LOGO -->
      <tr><td style="padding:32px 20px 24px;text-align:center;background:#ffffff;">
        ${chrome.logoUrl
          ? `<img src="${esc(chrome.logoUrl)}" alt="SEPRI Group" style="height:42px;display:inline-block;" />`
          : `<div style="font-weight:900;font-size:20px;color:${NAVY};letter-spacing:1px;">sepri <span style="font-size:11px;color:${TURQ};font-weight:600;">Group</span></div>`}
      </td></tr>

      <!-- HERO (fundo de ponta a ponta) -->
      <tr><td style="background:${NAVY};padding:28px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="32" style="width:32px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="72" valign="middle" style="font-size:48px;line-height:1;color:#ffffff;">${esc(heroIcon)}</td>
            <td valign="middle">
              ${heroTag ? renderHeroTag(heroTag) : ""}
              <h1 style="color:#ffffff;font-size:24px;line-height:1.25;margin:0;font-weight:800;">${esc(heroTitle)}</h1>
            </td>
            <td width="32" style="width:32px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
        </table>
      </td></tr>

      <!-- INTRO -->
      ${renderIntroBlock(introParas)}

      <!-- BODY -->
      <tr><td style="padding:32px 56px;background:#ffffff;color:${INK};font-size:14px;line-height:1.6;">
        ${bodyBlock}
      </td></tr>


      <!-- DESTAQUE (recurso/imagem associado, ex: panfleto para descarregar) -->
      ${highlightRows}

      <!-- CTA -->
      ${finalCta ? renderCta(finalCta) : ""}

      <tr><td><hr style="border:none;border-top:1px solid ${BORDER};margin:0 40px;" /></td></tr>

      <!-- FOOTER -->
      <tr><td style="background:${LIGHT_BG};padding:32px 40px 24px;text-align:center;font-size:12px;color:#5a6472;line-height:1.8;">
        <strong style="display:block;font-size:13px;color:${INK};margin-bottom:12px;">SEPRI - Medicina no Trabalho Lda</strong>
        <div style="text-decoration:underline;">Avenida da Igreja nº42, 1 Dto, 1700-239 Lisboa</div>
        <div style="text-decoration:underline;">Rua Dr Loureiro Amorim nº183, 4710-487 Braga</div>
        <div style="text-decoration:underline;">Av. Kim Il Sung, no. 1078, Maputo, Moçambique</div>
        <div style="text-decoration:underline;">Rua 6-1L, Bairro da Boavista, Luanda, Angola</div>
        <div style="margin-top:6px;">www.sepri.pt · comunicacao@sepri.pt</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px auto;">
          <tr>
            ${renderSocialIcon("https://www.linkedin.com/company/sepri-group/", "linkedin", "LinkedIn")}
            ${renderSocialIcon("https://www.instagram.com/sepri_group/", "instagram", "Instagram")}
            ${renderSocialIcon("https://www.facebook.com/grupo.sepri", "facebook", "Facebook")}
            ${renderSocialIcon("https://www.youtube.com/@seprigroup", "youtube", "YouTube")}
          </tr>
        </table>
        <div>Este e-mail foi enviado para {{ contact.EMAIL }}.</div>
        <div style="font-size:11px;color:#8a93a0;margin-top:16px;">${chrome.disclaimerHtml}</div>
        <a href="{{ unsubscribe }}" style="display:inline-block;margin-top:10px;text-decoration:underline;color:#5a6472;font-size:12px;">Cancelar subscrição</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function renderSocialIcon(href: string, slug: string, label: string): string {
  const src = SOCIAL_ICON_DATA_URIS[slug] ?? "";
  return `<td width="28" height="28" align="center" valign="middle" style="width:28px;height:28px;border-radius:50%;background:${INK};text-align:center;vertical-align:middle;padding:0;">
    <a href="${esc(href)}" target="_blank" rel="noopener" style="display:block;line-height:0;text-decoration:none;">
      <img src="${src}" width="14" height="14" alt="${esc(label)}" style="display:inline-block;vertical-align:middle;border:0;" />
    </a>
  </td>
  <td width="8" style="width:8px;font-size:0;line-height:0;">&nbsp;</td>`;
}


function renderHeroTag(tag: string): string {
  return `<div style="margin:0 0 10px;">
    <span style="display:inline-block;height:26px;line-height:26px;padding:0 14px;background:${TURQ};color:${NAVY};font-size:12px;font-weight:700;letter-spacing:0.5px;border-radius:13px;text-align:center;text-transform:uppercase;white-space:nowrap;">${esc(tag)}</span>
  </div>`;
}



function renderIntroBlock(paragraphs: string[]): string {
  if (!paragraphs.length) return "";
  const [first, ...rest] = paragraphs;
  const firstHtml = `<strong style="display:block;font-size:15px;margin-bottom:10px;">${esc(first)}</strong>`;
  const restHtml = rest.map((p) => esc(p)).join(" ");
  return `<tr><td style="background:${TURQ};color:#ffffff;text-align:center;padding:28px 0;font-size:14px;line-height:1.7;">
    <div style="padding:0 40px;">${firstHtml}${restHtml}</div>
  </td></tr>`;
}


function renderHighlightBlock(resource: NewsletterResource): string {
  const img = resource.imageUrl
    ? `<img src="${esc(resource.imageUrl)}" alt="${esc(resource.heading)}" style="display:block;max-width:220px;width:100%;height:auto;margin:0 auto;border-radius:6px;" />`
    : `<div style="background:${BORDER};height:120px;width:220px;margin:0 auto;border-radius:6px;"></div>`;
  const media = resource.linkUrl
    ? `<a href="${esc(resource.linkUrl)}" style="text-decoration:none;">${img}</a>`
    : img;
  return `<tr><td style="background:${LIGHT_BG};padding:28px 40px;text-align:center;">
    <h3 style="font-size:15px;margin:0 0 12px;color:${INK};">${esc(resource.heading)}</h3>
    ${media}
  </td></tr>`;
}

function renderCta(cta: NewsletterCta): string {
  const href = cta.url ?? "https://www.sepri.pt/contactos";
  return `<tr><td style="padding:8px 40px 32px;background:#ffffff;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
      <tr><td height="48" align="center" valign="middle" style="height:48px;line-height:48px;background:${NAVY};border-radius:20px;padding:0 32px;text-align:center;vertical-align:middle;">
        <a href="${esc(href)}" style="color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;line-height:48px;display:inline-block;vertical-align:middle;">${esc(cta.label)}</a>
      </td></tr>
    </table>
  </td></tr>`;

}


function renderItemBody(item: NewsletterItemContent | undefined): string {
  if (!item) return "";
  const sections = (item.sections ?? []).map(renderSection).join("\n");
  const guidelines = item.guidelines ? renderGuidelines(item.guidelines) : "";
  const closing = item.closing_paragraph
    ? `<p style="font-size:14px;line-height:1.6;color:${INK};margin:20px 0 0;">${fmt(item.closing_paragraph)}</p>`
    : "";
  const sourceLine = renderSourceLine(item);
  return `${sections}${guidelines}${closing}${sourceLine}`;
}

function renderCompositeItem(item: NewsletterItemContent): string {
  const heading = renderSectionHeading({ icon: item.overtitle ? "📌" : "🗂", heading: item.title });
  const intro = (item.intro_paragraphs ?? [])
    .map((p) => `<p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 12px;">${fmt(p)}</p>`)
    .join("");
  const sections = (item.sections ?? []).map(renderSection).join("\n");
  const guidelines = item.guidelines ? renderGuidelines(item.guidelines) : "";
  const closing = item.closing_paragraph
    ? `<p style="font-size:14px;line-height:1.6;color:${INK};margin:16px 0 0;">${fmt(item.closing_paragraph)}</p>`
    : "";
  const src = renderSourceLine(item);
  return `${heading}${intro}${sections}${guidelines}${closing}${src}`;
}

function renderSection(section: NewsletterSection): string {
  const heading = renderSectionHeading(section);
  const paragraphs = (section.paragraphs ?? [])
    .map((p) => `<p style="font-size:14px;line-height:1.6;color:${INK};margin:0 0 12px;">${fmt(p)}</p>`)
    .join("");
  const bullets =
    section.bullets && section.bullets.length ? renderBullets(section.bullets) : "";
  const subs = (section.subsections ?? [])
    .map((sub) => {
      const subBullets = sub.bullets && sub.bullets.length ? renderBullets(sub.bullets) : "";
      const subPara = sub.paragraph
        ? `<p style="margin:0 0 8px;color:${MUTED};font-size:14px;line-height:1.6;">${fmt(sub.paragraph)}</p>`
        : "";
      return `<div style="margin:10px 0;">
        <p style="font-weight:bold;margin:0 0 2px;color:${INK};font-size:14px;">${esc(sub.heading)}</p>
        ${subPara}${subBullets}
      </div>`;
    })
    .join("");
  return `${heading}${paragraphs}${bullets}${subs}`;
}

function renderSectionHeading(section: { icon?: string; heading: string }): string {
  const icon = section.icon ? `${section.icon} ` : "";
  return `<h2 style="font-size:16px;margin:28px 0 10px;color:${INK};font-weight:bold;">${esc(icon)}${esc(section.heading)}</h2>`;
}

function renderBullets(items: string[]): string {
  const li = items
    .map(
      (b) => `<li style="margin:0 0 6px;color:${INK};"><span style="font-weight:bold;">${fmt(b)}</span></li>`,
    )
    .join("");
  return `<ul style="margin:8px 0 16px;padding-left:20px;font-size:14px;line-height:1.6;">${li}</ul>`;
}

function renderGuidelines(g: NewsletterGuidelines): string {
  const intro = g.intro
    ? `<p style="margin:0 0 10px;color:${MUTED};font-size:14px;line-height:1.6;">${fmt(g.intro)}</p>`
    : "";
  const items = g.items
    .map((it) => `<li style="margin:0 0 6px;color:${INK};"><span style="font-weight:bold;">${fmt(it)}</span></li>`)
    .join("");
  return `<h2 style="font-size:16px;margin:28px 0 10px;color:${INK};font-weight:bold;">✅ ${esc(g.heading)}</h2>
    ${intro}
    <ul style="margin:8px 0 16px;padding-left:20px;font-size:14px;line-height:1.6;">${items}</ul>`;
}

function renderSourceLine(item: NewsletterItemContent): string {
  const pub = item.published_at
    ? `Publicado em ${esc(new Date(item.published_at).toLocaleDateString("pt-PT"))}`
    : "";
  const src = item.source_name ? `Fonte: ${esc(item.source_name)}` : "";
  const line = [pub, src].filter(Boolean).join(" · ");
  const link = item.source_url
    ? ` — <a href="${esc(item.source_url)}" style="color:${NAVY};text-decoration:underline;">Ler na fonte original →</a>`
    : "";
  if (!line && !link) return "";
  return `<p style="font-size:12px;color:#5a6472;margin:20px 0 0;">${line}${link}</p>`;
}

function pickHeroIcon(tag?: string, title?: string): string {
  const s = `${tag ?? ""} ${title ?? ""}`.toLowerCase();
  if (/vacin|saúde|saude|dgs|gripe|covid|doen/.test(s)) return "🏥";
  if (/psic|mental|stress|burnout|ansied/.test(s)) return "🧠";
  if (/incend|fogo|autoprote|emerg/.test(s)) return "🚒";
  if (/legisla|portaria|decreto|lei |código|codigo|diário|diario/.test(s)) return "📋";
  if (/formaç|forma|curso/.test(s)) return "🎓";
  if (/aliment|nutri|coração|cora|corpo/.test(s)) return "🥦";
  if (/ambient|clima|sustenta/.test(s)) return "🌿";
  return "📋";
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(s: string): string {
  return esc(s).replace(/\*\*(.+?)\*\*/g, `<strong>$1</strong>`);
}
