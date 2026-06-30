import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_TTL_DAYS = 14;

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function secret(): string {
  const s = process.env.APPROVAL_TOKEN_SECRET;
  if (!s) throw new Error("APPROVAL_TOKEN_SECRET não configurado");
  return s;
}

export type TokenAction = "approve" | "reject";

export function signToken(detectionId: string, action: TokenAction): string {
  const expires = Date.now() + TOKEN_TTL_DAYS * 86400_000;
  const payload = `${detectionId}|${action}|${expires}`;
  const sig = createHmac("sha256", secret()).update(payload).digest();
  return `${b64url(payload)}.${b64url(sig)}`;
}

export function verifyToken(
  token: string,
): { detectionId: string; action: TokenAction } | null {
  try {
    const [payloadB64, sigB64] = token.split(".");
    if (!payloadB64 || !sigB64) return null;
    const payload = b64urlDecode(payloadB64).toString("utf8");
    const sig = b64urlDecode(sigB64);
    const expected = createHmac("sha256", secret()).update(payload).digest();
    if (sig.length !== expected.length) return null;
    if (!timingSafeEqual(sig, expected)) return null;
    const [detectionId, action, expiresStr] = payload.split("|");
    if (!detectionId || (action !== "approve" && action !== "reject")) return null;
    const expires = Number(expiresStr);
    if (!expires || Date.now() > expires) return null;
    return { detectionId, action };
  } catch {
    return null;
  }
}

export function buildApprovalUrls(origin: string, detectionId: string) {
  return {
    approveUrl: `${origin}/api/public/approve?token=${encodeURIComponent(signToken(detectionId, "approve"))}`,
    rejectUrl: `${origin}/api/public/reject?token=${encodeURIComponent(signToken(detectionId, "reject"))}`,
  };
}
