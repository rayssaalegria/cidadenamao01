import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type SolicitacaoRow = {
  id: number;
  created_at: string;
  cpf: number | null;
  nome: string | null;
  titulo: string | null;
  descricao: string | null;
  tipo: string | null;
  status: string | null;
};

function toNumericOrNull(value: string) {
  const d = value.replace(/\D/g, "");
  if (!d) return null;
  const n = Number(d);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cpf = url.searchParams.get("cpf")?.trim() || "";
  const status = url.searchParams.get("status")?.trim() || "";

  // Essa rota não pode derrubar a UI. Se não vier CPF, devolvemos vazio.
  if (!cpf) return NextResponse.json({ data: [] satisfies SolicitacaoRow[] }, { status: 200 });

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch {
    // Sem Supabase configurado: não quebra a tela, retorna vazio.
    return NextResponse.json({ data: [] satisfies SolicitacaoRow[] }, { status: 200 });
  }

  const cpfNum = toNumericOrNull(cpf);
  if (cpfNum === null) return NextResponse.json({ data: [] satisfies SolicitacaoRow[] }, { status: 200 });

  let q = supabaseAdmin
    .from("solicitacoes")
    .select("id,created_at,cpf,nome,titulo,descricao,tipo,status")
    .eq("cpf", cpfNum)
    .order("created_at", { ascending: false });

  if (status) q = q.eq("status", status);

  const res = await q;
  if (res.error) {
    const msg = String(res.error.message || "");
    // A tabela pode ainda não existir ou o PostgREST pode estar com o schema cache desatualizado.
    if (
      /relation .* does not exist/i.test(msg) ||
      /does not exist/i.test(msg) ||
      /schema cache/i.test(msg) ||
      /Could not find the table .* in the schema cache/i.test(msg)
    ) {
      return NextResponse.json({ data: [] satisfies SolicitacaoRow[] }, { status: 200 });
    }
    return NextResponse.json({ error: msg || "Erro ao carregar solicitações" }, { status: 500 });
  }

  return NextResponse.json({ data: (res.data || []) as SolicitacaoRow[] }, { status: 200 });
}

