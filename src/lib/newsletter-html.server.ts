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
const BORDER = "#d5dbe0";
const PAGE_BG = "#e5e9ed";

export function renderNewsletterHtml(doc: NewsletterDocument, chrome: NewsletterChrome): string {
  const isComposite = !!doc.composite_intro;

  const heroTag = isComposite ? doc.composite_intro?.overtitle : doc.items[0]?.overtitle;
  const heroTitle = isComposite ? doc.composite_intro?.title ?? "" : doc.items[0]?.title ?? "";
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

  const logoHtml = chrome.logoUrl
    ? `<img src="${chrome.logoUrl}" alt="SEPRI Group" style="max-height:52px;display:block;margin:0 auto;" />`
    : `<div style="font-family:Arial,sans-serif;font-size:22px;font-weight:700;color:${NAVY};letter-spacing:1px;">sepri <span style="font-weight:400;">Group</span></div>`;

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(doc.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};font-family:Arial,Helvetica,sans-serif;color:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:640px;background:#ffffff;border:1px solid ${BORDER};border-radius:6px;overflow:hidden;">
        <!-- Logo -->
        <tr><td align="center" style="padding:28px 24px 20px;background:#ffffff;">
          ${logoHtml}
        </td></tr>

        <!-- Hero -->
        <tr><td style="background:${NAVY};padding:36px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:64px;vertical-align:top;font-size:40px;line-height:1;">${esc(heroIcon)}</td>
              <td style="vertical-align:top;">
                ${
                  heroTag
                    ? `<div style="display:inline-block;background:${TURQ};color:${NAVY};font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;padding:4px 10px;border-radius:3px;margin-bottom:12px;">${esc(heroTag)}</div>`
                    : ""
                }
                <h1 style="margin:0;color:#ffffff;font-size:26px;line-height:1.25;font-weight:700;">${esc(heroTitle)}</h1>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Intro (turquoise) -->
        ${renderIntroBlock(introParas)}

        <!-- Body -->
        <tr><td style="padding:32px;background:#ffffff;color:${INK};font-size:15px;line-height:1.6;">
          ${bodyBlock}
        </td></tr>

        ${highlightRows}

        ${finalCta ? `<tr><td align="center" style="padding:8px 32px 36px;background:#ffffff;">${renderCta(finalCta)}</td></tr>` : ""}

        <!-- Footer -->
        <tr><td style="background:${NAVY};color:#ffffff;padding:28px 32px;font-size:12px;line-height:1.6;">
          <div style="font-weight:700;margin-bottom:6px;">SEPRI - Medicina no Trabalho Lda</div>
          <div>Avenida da Igreja nº42, 1 Dto, 1700-239 Lisboa</div>
          <div>Rua Dr Loureiro Amorim nº183, 4710-487 Braga</div>
          <div>Av. Kim Il Sung, no. 1078, Maputo, Moçambique</div>
          <div>Rua 6-1L, Bairro da Boavista, Luanda, Angola</div>
          <div style="margin-top:10px;">www.sepri.pt · comunicacao@sepri.pt</div>
          <div style="margin-top:14px;">
            <a href="https://www.linkedin.com/company/sepri" style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;background:#ffffff;color:${NAVY};font-weight:700;border-radius:50%;text-decoration:none;font-size:11px;margin-right:6px;">in</a>
            <a href="https://www.instagram.com/sepri" style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;background:#ffffff;color:${NAVY};font-weight:700;border-radius:50%;text-decoration:none;font-size:11px;margin-right:6px;">ig</a>
            <a href="https://www.facebook.com/sepri" style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;background:#ffffff;color:${NAVY};font-weight:700;border-radius:50%;text-decoration:none;font-size:11px;margin-right:6px;">fb</a>
            <a href="https://www.youtube.com/@sepri" style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;background:#ffffff;color:${NAVY};font-weight:700;border-radius:50%;text-decoration:none;font-size:11px;">yt</a>
          </div>
          <div style="margin-top:16px;font-size:11px;color:#c7d3e0;">Este e-mail foi enviado para {{ contact.EMAIL }}.</div>
          <div style="margin-top:6px;font-size:11px;color:#c7d3e0;">${chrome.disclaimerHtml}</div>
          <div style="margin-top:10px;"><a href="{{ unsubscribe }}" style="color:#ffffff;text-decoration:underline;font-size:11px;">Cancelar subscrição</a></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderIntroBlock(paragraphs: string[]): string {
  if (!paragraphs.length) return "";
  const [first, ...rest] = paragraphs;
  const firstHtml = `<span style="color:#ffffff;font-weight:700;">${esc(first)}</span>`;
  const restHtml = rest.map((p) => ` <span style="color:#ffffff;">${esc(p)}</span>`).join("");
  return `<tr><td style="background:${TURQ};color:#ffffff;padding:22px 32px;font-size:15px;line-height:1.55;">
    ${firstHtml}${restHtml}
  </td></tr>`;
}

function renderHighlightBlock(resource: NewsletterResource): string {
  const img = resource.imageUrl
    ? `<img src="${resource.imageUrl}" alt="${esc(resource.heading)}" style="max-width:100%;display:block;border:0;" />`
    : "";
  const media = resource.linkUrl ? `<a href="${resource.linkUrl}" style="text-decoration:none;">${img}</a>` : img;
  return `<tr><td style="padding:0 32px 24px;background:#ffffff;">
    <p style="margin:0 0 8px;font-weight:700;color:${NAVY};font-size:14px;">${esc(resource.heading)}</p>
    ${media}
  </td></tr>`;
}

function renderCta(cta: NewsletterCta): string {
  const href = cta.url ?? "https://www.sepri.pt/contactos";
  return `<a href="${href}" style="display:inline-block;background:${NAVY};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 28px;border-radius:28px;">${esc(cta.label)}</a>`;
}

function renderItemBody(item: NewsletterItemContent | undefined): string {
  if (!item) return "";
  const sections = (item.sections ?? []).map(renderSection).join("\n");
  const guidelines = item.guidelines ? renderGuidelines(item.guidelines) : "";
  const closing = item.closing_paragraph
    ? `<p style="margin:16px 0 0;color:${INK};font-size:15px;line-height:1.6;">${fmt(item.closing_paragraph)}</p>`
    : "";
  const sourceLine = renderSourceLine(item);
  return `${sections}${guidelines}${closing}${sourceLine}`;
}

function renderCompositeItem(item: NewsletterItemContent): string {
  const heading = renderSectionHeading({ icon: item.overtitle ? "📌" : "🗂", heading: item.title });
  const intro = (item.intro_paragraphs ?? [])
    .map((p) => `<p style="margin:0 0 12px;color:${INK};font-size:15px;line-height:1.6;">${fmt(p)}</p>`)
    .join("");
  const sections = (item.sections ?? []).map(renderSection).join("\n");
  const guidelines = item.guidelines ? renderGuidelines(item.guidelines) : "";
  const closing = item.closing_paragraph
    ? `<p style="margin:16px 0 0;color:${INK};font-size:15px;line-height:1.6;">${fmt(item.closing_paragraph)}</p>`
    : "";
  const src = renderSourceLine(item);
  return `<div style="margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid ${BORDER};">${heading}${intro}${sections}${guidelines}${closing}${src}</div>`;
}

function renderSection(section: NewsletterSection): string {
  const heading = renderSectionHeading(section);
  const paragraphs = (section.paragraphs ?? [])
    .map((p) => `<p style="margin:0 0 12px;color:${INK};font-size:15px;line-height:1.6;">${fmt(p)}</p>`)
    .join("");
  const bullets = section.bullets && section.bullets.length ? renderBullets(section.bullets) : "";
  const subs = (section.subsections ?? [])
    .map((sub) => {
      const subBullets = sub.bullets && sub.bullets.length ? renderBullets(sub.bullets) : "";
      const subPara = sub.paragraph
        ? `<p style="margin:0 0 8px;color:${INK};font-size:15px;line-height:1.6;">${fmt(sub.paragraph)}</p>`
        : "";
      return `<div style="margin:8px 0 12px;">
        <p style="margin:0 0 6px;font-weight:700;color:${NAVY};font-size:14px;">${esc(sub.heading)}</p>
        ${subPara}${subBullets}
      </div>`;
    })
    .join("");
  return `${heading}${paragraphs}${bullets}${subs}`;
}

function renderSectionHeading(section: { icon?: string; heading: string }): string {
  const icon = section.icon ? `${section.icon} ` : "";
  return `<h2 style="margin:20px 0 12px;color:${NAVY};font-size:18px;font-weight:700;line-height:1.3;">${esc(icon)}${esc(section.heading)}</h2>`;
}

function renderBullets(items: string[]): string {
  const li = items
    .map((b) => `<li style="margin:0 0 6px;color:${INK};font-size:15px;line-height:1.55;">${fmt(b)}</li>`)
    .join("");
  return `<ul style="margin:0 0 14px;padding-left:20px;">${li}</ul>`;
}

function renderGuidelines(g: NewsletterGuidelines): string {
  const intro = g.intro
    ? `<p style="margin:0 0 10px;color:${INK};font-size:15px;line-height:1.6;">${fmt(g.intro)}</p>`
    : "";
  const items = g.items
    .map((it) => `<li style="margin:0 0 6px;color:${INK};font-size:15px;line-height:1.55;">${fmt(it)}</li>`)
    .join("");
  return `<h2 style="margin:20px 0 12px;color:${NAVY};font-size:18px;font-weight:700;line-height:1.3;">✅ ${esc(g.heading)}</h2>
    ${intro}
    <ul style="margin:0 0 14px;padding-left:20px;">${items}</ul>`;
}

function renderSourceLine(item: NewsletterItemContent): string {
  const pub = item.published_at
    ? `Publicado em ${esc(new Date(item.published_at).toLocaleDateString("pt-PT"))}`
    : "";
  const src = item.source_name ? `Fonte: ${esc(item.source_name)}` : "";
  const line = [pub, src].filter(Boolean).join(" · ");
  const link = item.source_url
    ? ` — <a href="${item.source_url}" style="color:${NAVY};">Ler na fonte original →</a>`
    : "";
  if (!line && !link) return "";
  return `<p style="margin:16px 0 0;color:${MUTED};font-size:12px;">${line}${link}</p>`;
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
