import { createAnthropic } from "@ai-sdk/anthropic";

/** Cria uma instância do provider Anthropic com a chave dada. Uso: createClaudeAi(key)(MODEL). */
export function createClaudeAi(apiKey: string) {
  return createAnthropic({ apiKey });
}

export function requireAnthropicApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY não configurada");
  return key;
}

/**
 * Modelo rápido/económico — usado na triagem diária das 6 fontes (grande volume,
 * tarefa de classificação/extração estruturada, não precisa do modelo mais caro).
 */
export const FAST_MODEL = "claude-haiku-4-5-20251001";

/**
 * Modelo de maior qualidade — usado na redação final da newsletter, que é o
 * texto que chega ao cliente e onde vale a pena investir mais.
 */
export const QUALITY_MODEL = "claude-sonnet-5";
