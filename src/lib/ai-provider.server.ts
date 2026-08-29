// Chamadas diretas à API da Anthropic via fetch nativo — sem SDK (@ai-sdk/anthropic),
// para não depender de nenhum pacote novo no deploy.

export function requireAnthropicApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY não configurada");
  return key;
}

/** Modelo rápido/económico — usado na triagem diária das 6 fontes. */
export const FAST_MODEL = "claude-haiku-4-5-20251001";

/** Modelo de maior qualidade — usado na redação final da newsletter. */
export const QUALITY_MODEL = "claude-sonnet-5";

interface ClaudeStructuredOptions {
  model: string;
  system: string;
  prompt: string;
  /** Nome da "tool" forçada — usada só como mecanismo para obter JSON estruturado. */
  toolName: string;
  toolDescription?: string;
  /** JSON Schema (formato usado pelas tools da Anthropic) do objeto a devolver. */
  inputSchema: Record<string, unknown>;
  maxTokens?: number;
}

/**
 * Chama a API da Anthropic (Messages API) diretamente via fetch, forçando o uso
 * de uma tool para obter output estruturado de forma fiável (equivalente ao que
 * o "Output.object" do Vercel AI SDK fazia, mas sem precisar desse pacote).
 */
export async function callClaudeStructured<T = unknown>(opts: ClaudeStructuredOptions): Promise<T> {
  const apiKey = requireAnthropicApiKey();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 4096,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
      tools: [
        {
          name: opts.toolName,
          description: opts.toolDescription ?? "Devolve o resultado estruturado pedido.",
          input_schema: opts.inputSchema,
        },
      ],
      tool_choice: { type: "tool", name: opts.toolName },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; input?: unknown; name?: string }>;
  };
  const toolUse = (data.content ?? []).find((b) => b.type === "tool_use" && b.name === opts.toolName);
  if (!toolUse) {
    throw new Error("Claude não devolveu o resultado estruturado esperado (sem tool_use).");
  }
  return toolUse.input as T;
}
