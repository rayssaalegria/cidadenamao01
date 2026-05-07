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

  let restProbe:
    | { ok: true; status: number; responseKind: "json" | "text"; rows?: number; error?: string }
    | { ok: false; error: string }
    | null = null;
  let receitasSample:
    | { ok: true; status: number; rows: unknown[] }
    | { ok: true; status: number; error: string }
    | { ok: false; error: string }
    | null = null;
  let receitasFilterProbe:
    | { ok: true; status: number; rows: unknown[] }
    | { ok: true; status: number; error: string }
    | { ok: false; error: string }
    | null = null;

  if (supabaseUrl && serviceKey) {
    try {
      const url = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/receitas?select=id&limit=1`;
      const r = await fetch(url, {
        headers: {
          apikey: serviceKey,
          // IMPORTANTE: não mandar Authorization com sb_secret (não é JWT)
          // e também não expor/registrar a key em logs.
        },
        cache: "no-store",
      });

      const ct = r.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const body = (await r.json()) as unknown;
        const rows = Array.isArray(body) ? body.length : undefined;
        restProbe = { ok: true, status: r.status, responseKind: "json", rows };
      } else {
        const text = await r.text();
        restProbe = {
          ok: true,
          status: r.status,
          responseKind: "text",
          error: text.slice(0, 180),
        };
      }
    } catch (e) {
      restProbe = { ok: false, error: e instanceof Error ? e.message : "probe_failed" };
    }

    try {
      const url = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/receitas?select=id,cpf,created_at&order=created_at.desc&limit=5`;
      const r = await fetch(url, { headers: { apikey: serviceKey }, cache: "no-store" });
      const ct = r.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const body = (await r.json()) as unknown;
        receitasSample = Array.isArray(body)
          ? { ok: true, status: r.status, rows: body }
          : { ok: true, status: r.status, error: "unexpected_json" };
      } else {
        const text = await r.text();
        receitasSample = { ok: true, status: r.status, error: text.slice(0, 180) };
      }
    } catch (e) {
      receitasSample = { ok: false, error: e instanceof Error ? e.message : "sample_failed" };
    }

    try {
      const cpfTest = "2380098239";
      const url = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/receitas?select=id,cpf&cpf=eq.${encodeURIComponent(
        cpfTest
      )}&limit=5`;
      const r = await fetch(url, { headers: { apikey: serviceKey }, cache: "no-store" });
      const ct = r.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const body = (await r.json()) as unknown;
        receitasFilterProbe = Array.isArray(body)
          ? { ok: true, status: r.status, rows: body }
          : { ok: true, status: r.status, error: "unexpected_json" };
      } else {
        const text = await r.text();
        receitasFilterProbe = { ok: true, status: r.status, error: text.slice(0, 180) };
      }
    } catch (e) {
      receitasFilterProbe = { ok: false, error: e instanceof Error ? e.message : "filter_probe_failed" };
    }
  }

  return NextResponse.json(
    {
      ok: true,
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceKey),
      serviceKeyType: serviceKey.startsWith("sb_secret_")
        ? "sb_secret"
        : serviceKey.startsWith("sb_publishable_")
          ? "sb_publishable"
          : serviceKey.includes(".")
            ? "jwt"
            : "unknown",
      // Não expõe chave. Apenas infere o role do payload (sem validar assinatura).
      serviceRoleKeyRole: serviceKey ? inferJwtRole(serviceKey) : null,
      restProbe,
      receitasSample,
      receitasFilterProbe,
    },
    { status: 200 }
  );
}

