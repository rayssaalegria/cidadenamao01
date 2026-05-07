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

export async function GET(req: Request) {
  const cpf = new URL(req.url).searchParams.get("cpf")?.trim() || "";
  if (!cpf) return NextResponse.json({ error: "cpf é obrigatório" }, { status: 400 });
  const debug = new URL(req.url).searchParams.get("debug") === "1";

  let supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch {
    // Sem Supabase configurado: não quebra a tela, retorna vazio.
    if (debug) {
      return NextResponse.json({ ok: false, error: "supabase_admin_not_configured" }, { status: 500 });
    }
    return NextResponse.json({ data: [] satisfies ReceitaRow[] }, { status: 200 });
  }

  const cpfDigits = toDigits(cpf);
  const cpfNum = toNumericOrNull(cpfDigits);
  if (cpfNum === null) return NextResponse.json({ error: "CPF inválido" }, { status: 400 });

  const selectWithConteudo =
    "id,created_at,cpf,profissional,crm,especialidade,image_url,conteudo,status" as const;
  const selectNoConteudo = "id,created_at,cpf,profissional,crm,especialidade,image_url,status" as const;

  async function runQuery(select: string) {
    // 1) tenta como número (coluna numeric/bigint) — é o caso mais comum
    const r1 = await supabaseAdmin
      .from("receitas")
      .select(select)
      .eq("cpf", cpfNum)
      .order("created_at", { ascending: false });
    if (r1.error) return r1;
    if ((r1.data || []).length) return r1;

    // 2) tenta como string do número (coluna text sem zero à esquerda)
    const r1b = await supabaseAdmin
      .from("receitas")
      .select(select)
      .eq("cpf", String(cpfNum))
      .order("created_at", { ascending: false });
    if (r1b.error) return r1b;
    if ((r1b.data || []).length) return r1b;

    // 3) tenta como string de dígitos (coluna text com zero à esquerda)
    const r2 = await supabaseAdmin
      .from("receitas")
      .select(select)
      .eq("cpf", cpfDigits)
      .order("created_at", { ascending: false });
    if (r2.error) return r2;
    if ((r2.data || []).length) return r2;

    // 4) tenta CPF bruto (caso esteja salvo com máscara)
    return await supabaseAdmin
      .from("receitas")
      .select(select)
      .eq("cpf", cpf)
      .order("created_at", { ascending: false });
  }

  // A tabela `receitas` pode ainda não existir. Nesse caso, retornamos lista vazia
  // para não quebrar a UI enquanto o backend/schema é finalizado.
  // Compatibilidade: a tabela/colunas podem não existir ainda.
  // Tentamos buscar `conteudo` quando disponível, e fazemos fallback.
  let res: any = await runQuery(selectWithConteudo);

  if (res.error) {
    const msg = String(res.error.message || "");
    if (/relation .* does not exist/i.test(msg) || /does not exist/i.test(msg)) {
      return NextResponse.json({ data: [] satisfies ReceitaRow[] }, { status: 200 });
    }
    // coluna `conteudo` pode não existir ainda
    if (missingConteudoColumn(msg)) {
      res = await runQuery(selectNoConteudo);
    }
  }

  if (res.error) {
    const msg = String(res.error.message || "");
    if (/relation .* does not exist/i.test(msg) || /does not exist/i.test(msg)) {
      return NextResponse.json({ data: [] satisfies ReceitaRow[] }, { status: 200 });
    }
    return NextResponse.json({ error: msg || "Erro ao carregar receitas" }, { status: 500 });
  }

  if (debug) {
    return NextResponse.json(
      {
        ok: true,
        cpfRaw: cpf,
        cpfDigits,
        cpfNum,
        rows: Array.isArray(res.data) ? res.data.length : 0,
        sample: Array.isArray(res.data) ? res.data.slice(0, 1) : [],
      },
      { status: 200 }
    );
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
  const cpfDigits = toDigits(cpf);
  const cpfNum = toNumericOrNull(cpfDigits);
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
      cpf: cpfDigits,
      profissional: profissional || null,
      crm: crm || null,
      especialidade: especialidade || null,
      conteudo: conteudo || null,
      image_url: imageUrl || null,
      status: status || null,
    })
    .select("id,cpf")
    .single();

  if (res.error) {
    const msg = String(res.error.message || "");
    if (missingConteudoColumn(msg)) {
      res = await supabaseAdmin
        .from("receitas")
        .insert({
          cpf: cpfDigits,
          profissional: profissional || null,
          crm: crm || null,
          especialidade: especialidade || null,
          image_url: imageUrl || null,
          status: status || null,
        })
        .select("id,cpf")
        .single();
    }
  }

  if (res.error) {
    const msg = String(res.error.message || "");
    return NextResponse.json({ error: msg || "Erro ao criar receita" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: res.data?.id, cpf: res.data?.cpf ?? null }, { status: 200 });
}

