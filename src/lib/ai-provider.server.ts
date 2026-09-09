// Chamadas diretas à API do Google Gemini via fetch nativo — gratuita (sem
// cartão de crédito) na Google AI Studio para os modelos Flash, ao contrário
// da API da Anthropic que exige saldo pré-pago.

export function requireGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY não configurada");
  return key;
}

/** Modelo usado na triagem diária das 6 fontes — Flash-Lite tem quota gratuita
 * diária muito mais alta, sendo mais do que suficiente para classificação/extração. */
export const FAST_MODEL = "gemini-3.5-flash-lite";

/** Modelo usado na redação da newsletter — mesma geração do FAST_MODEL (evita
 * repetir o problema de "modelo já não disponível para novos utilizadores"),
 * com mais qualidade que o Lite. */
export const QUALITY_MODEL = "gemini-3.5-flash";

interface AiStructuredOptions {
  model: string;
  system: string;
  prompt: string;
  /** JSON Schema do objeto a devolver (subset suportado pelo responseSchema do Gemini). */
  inputSchema: Record<string, unknown>;
  maxTokens?: number;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Chama a API do Gemini (generateContent) diretamente via fetch, usando
 * responseSchema/responseMimeType para obter JSON estruturado de forma fiável
 * (equivalente ao "Output.object" do Vercel AI SDK, mas sem esse pacote).
 * Repete automaticamente em caso de erro transitório (503 sobrecarregado,
 * 429 limite de pedidos), com espera crescente entre tentativas.
 */
export async function callAiStructured<T = unknown>(opts: AiStructuredOptions): Promise<T> {
  const apiKey = requireGeminiApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent`;
  const maxAttempts = 4;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: opts.system }] },
          contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: opts.inputSchema,
            maxOutputTokens: opts.maxTokens ?? 8192,
            // Modelos Gemini 3 usam thinkingLevel; a série 2.5 usa thinkingBudget
            // (em tokens). Em qualquer dos casos, o objetivo é minimizar o
            // "pensamento" interno, que consome o MESMO orçamento de tokens que
            // a resposta visível.
            thinkingConfig: opts.model.startsWith("gemini-3")
              ? { thinkingLevel: "low" }
              : { thinkingBudget: opts.model.includes("flash-lite") ? 512 : 0 },
          },
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        const transient = res.status === 503 || res.status === 429;
        if (transient && attempt < maxAttempts) {
          await sleep(800 * 2 ** (attempt - 1));
          continue;
        }
        throw new Error(`Gemini API ${res.status}: ${text.slice(0, 500)}`);
      }

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text.trim()) {
        throw new Error("Gemini não devolveu conteúdo (possível bloqueio de segurança ou resposta vazia).");
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new Error(`Gemini devolveu JSON inválido: ${text.slice(0, 300)}`);
      }
    } catch (err) {
      lastErr = err;
      // erro de rede (não HTTP) — também vale a pena repetir
      if (attempt < maxAttempts && err instanceof TypeError) {
        await sleep(800 * 2 ** (attempt - 1));
        continue;
      }
      if (attempt >= maxAttempts) break;
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
