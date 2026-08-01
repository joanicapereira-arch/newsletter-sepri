declare module "html-to-docx" {
  interface HtmlToDocxOptions {
    title?: string;
    pageNumber?: boolean;
    footer?: boolean;
    header?: boolean;
    margins?: { top?: number; right?: number; bottom?: number; left?: number };
    [key: string]: unknown;
  }
  export default function HTMLtoDOCX(
    htmlString: string,
    headerHTMLString?: string | null,
    documentOptions?: HtmlToDocxOptions,
    footerHTMLString?: string | null,
  ): Promise<Buffer | Blob | ArrayBuffer>;
}
