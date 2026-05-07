import { NextResponse } from "next/server";
import { sasiFetch, type SasiMeResponse } from "@/lib/sasi";

type AtestadoRow = {
  id: number;
  created_at: string;
  cpf: number | null;
  profissional: string | null;
  crm: string | null;
  especialidade: string | null;
  image_url: string | null;
  conteudo?: string | null;
  status: string | null;
};

function toDigits(value: string) {
  return value.replace(/\D/g, "");
}

function toNumericOrNull(digits: string) {
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function missingConteudoColumn(msg: string) {
  return (
    /column .*conteudo.* does not exist/i.test(msg) ||
    /conteudo.*does not exist/i.test(msg) ||
    /could not find the ['"]conteudo['"] column/i.test(msg) ||
    /schema cache/i.test(msg)
  );
}

function getRequiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

function getSupabaseRest() {
  const url = getRequiredEnv("SUPABASE_URL").replace(/\/+$/, "");
  const key = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return { url, key };
}

async function supabaseRestJson<T>(path: string, init?: RequestInit) {
  const { url, key } = getSupabaseRest();
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  const text = await res.text();
  const ct = res.headers.get("content-type") || "";
  const json = ct.includes("application/json") && text ? (JSON.parse(text) as unknown) : null;
  return { ok: res.ok, status: res.status, json, text };
}

export async function GET(req: Request) {
  const cpf = new URL(req.url).searchParams.get("cpf")?.trim() || "";
  if (!cpf) return NextResponse.json({ error: "cpf é obrigatório" }, { status: 400 });

  const cpfDigits = toDigits(cpf);
  const cpfNum = toNumericOrNull(cpfDigits);
  if (cpfNum === null) return NextResponse.json({ error: "CPF inválido" }, { status: 400 });

  const selectWithConteudo =
    "id,created_at,cpf,profissional,crm,especialidade,image_url,conteudo,status" as const;
  const selectNoConteudo = "id,created_at,cpf,profissional,crm,especialidade,image_url,status" as const;

  const candidates = [String(cpfNum), cpfDigits, cpf];

  async function list(select: string) {
    for (const c of candidates) {
      const { ok, status, json, text } = await supabaseRestJson<AtestadoRow[]>(
        `/rest/v1/atestados?select=${encodeURIComponent(select)}&cpf=eq.${encodeURIComponent(c)}&order=created_at.desc`,
        { method: "GET" }
      );
      if (!ok) return { ok, status, json, text };
      if (Array.isArray(json) && json.length) return { ok, status, json, text };
    }
    return { ok: true, status: 200, json: [] as AtestadoRow[], text: "" };
  }

  // Compatibilidade: a tabela/colunas podem não existir ainda.
  // Tentamos buscar `conteudo` quando disponível, e fazemos fallback.
  let res = await list(selectWithConteudo);
  if (!res.ok && missingConteudoColumn(String(res.text || ""))) {
    res = await list(selectNoConteudo);
  }

  if (!res.ok) {
    const msg = String(res.text || "Erro ao carregar atestados");
    if (/relation .* does not exist/i.test(msg) || /does not exist/i.test(msg)) {
      return NextResponse.json({ data: [] satisfies AtestadoRow[] }, { status: 200 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ data: (res.json || []) as AtestadoRow[] }, { status: 200 });
}

type CreateAtestadoBody = {
  cpf?: string;
  profissional?: string | null;
  crm?: string | null;
  especialidade?: string | null;
  conteudo?: string | null;
  imageUrl?: string | null;
  status?: string | null;
};

export async function POST(req: Request) {
  let body: CreateAtestadoBody;
  try {
    body = (await req.json()) as CreateAtestadoBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const token =
    req.headers.get("x-sasi-token") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";

  let cpf = typeof body.cpf === "string" ? body.cpf.trim() : "";
  if (token) {
    const me = await sasiFetch<SasiMeResponse>("/api/v2/providers/external/me", token);
    const cpfFromMe = (me.profileProps?.cpf || "").trim();
    if (cpfFromMe) cpf = cpfFromMe;
  }

  if (!cpf) return NextResponse.json({ error: "cpf é obrigatório" }, { status: 400 });
  const cpfDigits = toDigits(cpf);
  const cpfNum = toNumericOrNull(cpfDigits);
  if (cpfNum === null) return NextResponse.json({ error: "CPF inválido" }, { status: 400 });

  const profissional = typeof body.profissional === "string" ? body.profissional.trim() : "";
  const crm = typeof body.crm === "string" ? body.crm.trim() : "";
  const especialidade = typeof body.especialidade === "string" ? body.especialidade.trim() : "";
  const conteudo = typeof body.conteudo === "string" ? body.conteudo.trim() : "";
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  const status = typeof body.status === "string" ? body.status.trim() : "Ativo";

  const insertPayload = {
    cpf: cpfDigits,
    profissional: profissional || null,
    crm: crm || null,
    especialidade: especialidade || null,
    conteudo: conteudo || null,
    image_url: imageUrl || null,
    status: status || null,
  };

  let r = await supabaseRestJson<{ id: number; cpf: unknown }[]>(
    `/rest/v1/atestados?select=id,cpf`,
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(insertPayload),
    }
  );

  if (!r.ok && missingConteudoColumn(String(r.text || ""))) {
    const payload2 = { ...insertPayload };
    delete (payload2 as any).conteudo;
    r = await supabaseRestJson<{ id: number; cpf: unknown }[]>(
      `/rest/v1/atestados?select=id,cpf`,
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload2),
      }
    );
  }

  if (!r.ok) return NextResponse.json({ error: r.text || "Erro ao criar atestado" }, { status: 500 });
  const row = Array.isArray(r.json) ? (r.json[0] as any) : null;
  return NextResponse.json({ ok: true, id: row?.id ?? null, cpf: row?.cpf ?? null }, { status: 200 });
}

