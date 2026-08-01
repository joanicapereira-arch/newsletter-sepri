/**
 * Converte o HTML já gerado da newsletter num documento Word editável (.doc,
 * formato "Word HTML"), sem dependências Node-only — abre no Word/Google Docs
 * e mantém títulos, parágrafos, listas, negrito, tabelas e imagens.
 */
export async function renderNewsletterDocx(html: string, title: string): Promise<Buffer> {
  const escapedTitle = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = html.replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");

  const doc = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<title>${escapedTitle}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page { size: A4; margin: 1.5cm; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #1a1a1a; }
img { max-width: 100%; height: auto; }
table { border-collapse: collapse; }
</style>
</head>
<body>
${body || html}
</body>
</html>`;

  return Buffer.from(doc, "utf-8");
}
