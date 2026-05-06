import { NextResponse } from "next/server";

function safeDecodeBase64Url(input: string) {
  try {
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    const pad = normalized.length % 4 ? "=".repeat(4 - (normalized.length % 4)) : "";
    return Buffer.from(normalized + pad, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function inferJwtRole(jwt: string) {
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  const payloadJson = safeDecodeBase64Url(parts[1]);
  if (!payloadJson) return null;
  try {
    const payload = JSON.parse(payloadJson) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  return NextResponse.json(
    {
      ok: true,
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceKey),
      // Não expõe chave. Apenas infere o role do payload (sem validar assinatura).
      serviceRoleKeyRole: serviceKey ? inferJwtRole(serviceKey) : null,
    },
    { status: 200 }
  );
}

