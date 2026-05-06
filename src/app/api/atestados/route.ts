import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
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

export async function GET(req: Request) {
  const cpf = new URL(req.url).searchParams.get("cpf")?.trim() || "";
  if (!cpf) return NextResponse.json({ error: "cpf é obrigatório" }, { status: 400 });

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ data: [] satisfies AtestadoRow[] }, { status: 200 });
  }

  const cpfDigits = toDigits(cpf);
  const cpfNum = toNumericOrNull(cpfDigits);
  if (cpfNum === null) return NextResponse.json({ error: "CPF inválido" }, { status: 400 });

  // Compatibilidade: a tabela/colunas podem não existir ainda.
  // Tentamos buscar `conteudo` quando disponível, e fazemos fallback.
  let res: any = await supabaseAdmin
    .from("atestados")
    .select("id,created_at,cpf,profissional,crm,especialidade,image_url,conteudo,status")
    .in("cpf", [cpf, cpfDigits, cpfNum])
    .order("created_at", { ascending: false });

  if (res.error) {
    const msg = String(res.error.message || "");
    if (/relation .* does not exist/i.test(msg) || /does not exist/i.test(msg)) {
      return NextResponse.json({ data: [] satisfies AtestadoRow[] }, { status: 200 });
    }
    // coluna `conteudo` pode não existir ainda
    if (/column .*conteudo.* does not exist/i.test(msg) || /conteudo.*does not exist/i.test(msg)) {
      res = await supabaseAdmin
        .from("atestados")
        .select("id,created_at,cpf,profissional,crm,especialidade,image_url,status")
        .in("cpf", [cpf, cpfDigits, cpfNum])
        .order("created_at", { ascending: false });
    }
  }

  if (res.error) {
    const msg = String(res.error.message || "");
    if (/relation .* does not exist/i.test(msg) || /does not exist/i.test(msg)) {
      return NextResponse.json({ data: [] satisfies AtestadoRow[] }, { status: 200 });
    }
    return NextResponse.json({ error: msg || "Erro ao carregar atestados" }, { status: 500 });
  }

  return NextResponse.json({ data: (res.data || []) as AtestadoRow[] }, { status: 200 });
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
  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

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

  // Compatibilidade: a coluna `conteudo` pode não existir ainda.
  // Tentamos inserir com `conteudo` e fazemos fallback sem ela.
  let res = await supabaseAdmin
    .from("atestados")
    .insert({
      cpf: cpfDigits,
      profissional: profissional || null,
      crm: crm || null,
      especialidade: especialidade || null,
      conteudo: conteudo || null,
      image_url: imageUrl || null,
      status: status || null,
    })
    .select("id")
    .single();

  if (res.error) {
    const msg = String(res.error.message || "");
    if (/column .*conteudo.* does not exist/i.test(msg) || /conteudo.*does not exist/i.test(msg)) {
      res = await supabaseAdmin
        .from("atestados")
        .insert({
          cpf: cpfDigits,
          profissional: profissional || null,
          crm: crm || null,
          especialidade: especialidade || null,
          image_url: imageUrl || null,
          status: status || null,
        })
        .select("id")
        .single();
    }
  }

  if (res.error) {
    const msg = String(res.error.message || "");
    return NextResponse.json({ error: msg || "Erro ao criar atestado" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: res.data?.id }, { status: 200 });
}

