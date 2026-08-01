import HTMLtoDOCX from "html-to-docx";

/**
 * Converte o HTML já gerado da newsletter num documento Word (.docx) editável.
 * Usa o HTML tal como é copiado para o Brevo — preserva títulos, parágrafos,
 * listas, negrito e imagens; tabelas de layout do email tornam-se tabelas
 * no Word (editável, ainda que o layout visual não seja pixel-perfect).
 */
export async function renderNewsletterDocx(html: string, title: string): Promise<Buffer> {
  const buffer = await HTMLtoDOCX(html, undefined, {
    title,
    pageNumber: false,
    footer: false,
    margins: { top: 720, right: 720, bottom: 720, left: 720 },
  });
  return buffer as Buffer;
}
