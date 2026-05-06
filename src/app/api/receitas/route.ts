import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sasiFetch, type SasiMeResponse } from "@/lib/sasi";

type ReceitaRow = {
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

function toNumericOrNull(value: string) {
  const d = value.replace(/\D/g, "");
  if (!d) return null;
  const n = Number(d);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request) {
  const cpf = new URL(req.url).searchParams.get("cpf")?.trim() || "";
  if (!cpf) return NextResponse.json({ error: "cpf é obrigatório" }, { status: 400 });

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch {
    // Sem Supabase configurado: não quebra a tela, retorna vazio.
    return NextResponse.json({ data: [] satisfies ReceitaRow[] }, { status: 200 });
  }

  const cpfNum = toNumericOrNull(cpf);
  if (cpfNum === null) return NextResponse.json({ error: "CPF inválido" }, { status: 400 });

  // A tabela `receitas` pode ainda não existir. Nesse caso, retornamos lista vazia
  // para não quebrar a UI enquanto o backend/schema é finalizado.
  // Compatibilidade: a tabela/colunas podem não existir ainda.
  // Tentamos buscar `conteudo` quando disponível, e fazemos fallback.
  let res: any = await supabaseAdmin
    .from("receitas")
    .select("id,created_at,cpf,profissional,crm,especialidade,image_url,conteudo,status")
    .eq("cpf", cpfNum)
    .order("created_at", { ascending: false });

  if (res.error) {
    const msg = String(res.error.message || "");
    if (/relation .* does not exist/i.test(msg) || /does not exist/i.test(msg)) {
      return NextResponse.json({ data: [] satisfies ReceitaRow[] }, { status: 200 });
    }
    // coluna `conteudo` pode não existir ainda
    if (/column .*conteudo.* does not exist/i.test(msg) || /conteudo.*does not exist/i.test(msg)) {
      res = await supabaseAdmin
        .from("receitas")
        .select("id,created_at,cpf,profissional,crm,especialidade,image_url,status")
        .eq("cpf", cpfNum)
        .order("created_at", { ascending: false });
    }
  }

  if (res.error) {
    const msg = String(res.error.message || "");
    if (/relation .* does not exist/i.test(msg) || /does not exist/i.test(msg)) {
      return NextResponse.json({ data: [] satisfies ReceitaRow[] }, { status: 200 });
    }
    return NextResponse.json({ error: msg || "Erro ao carregar receitas" }, { status: 500 });
  }

  return NextResponse.json({ data: (res.data || []) as ReceitaRow[] }, { status: 200 });
}

type CreateReceitaBody = {
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

  let body: CreateReceitaBody;
  try {
    body = (await req.json()) as CreateReceitaBody;
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
  const cpfNum = toNumericOrNull(cpf);
  if (cpfNum === null) return NextResponse.json({ error: "CPF inválido" }, { status: 400 });

  const profissional = typeof body.profissional === "string" ? body.profissional.trim() : "";
  const crm = typeof body.crm === "string" ? body.crm.trim() : "";
  const especialidade = typeof body.especialidade === "string" ? body.especialidade.trim() : "";
  const conteudo = typeof body.conteudo === "string" ? body.conteudo.trim() : "";
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  const status = typeof body.status === "string" ? body.status.trim() : "Ativa";

  // Compatibilidade: a coluna `conteudo` pode não existir ainda.
  // Tentamos inserir com `conteudo` e fazemos fallback sem ela.
  let res = await supabaseAdmin
    .from("receitas")
    .insert({
      cpf: cpfNum,
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
        .from("receitas")
        .insert({
          cpf: cpfNum,
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
    return NextResponse.json({ error: msg || "Erro ao criar receita" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: res.data?.id }, { status: 200 });
}

