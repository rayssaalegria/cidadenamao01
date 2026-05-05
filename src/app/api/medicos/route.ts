import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type MedicoRow = {
  id: number;
  created_at: string;
  nome: string;
  crm: string;
  especialidade: string | null;
  email?: string | null;
  telefone?: string | null;
  ativo: boolean;
};

type CreateBody = {
  nome?: unknown;
  crm?: unknown;
  especialidade?: unknown;
  email?: unknown;
  telefone?: unknown;
  ativo?: unknown;
};

export async function GET() {
  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const res = await supabaseAdmin
    .from("medicos")
    .select("id,created_at,nome,crm,especialidade,email,telefone,ativo")
    .order("created_at", { ascending: false });

  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  return NextResponse.json({ data: (res.data || []) as MedicoRow[] }, { status: 200 });
}

export async function POST(req: Request) {
  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const crm = typeof body.crm === "string" ? body.crm.trim() : "";
  const especialidade = typeof body.especialidade === "string" ? body.especialidade.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const telefone = typeof body.telefone === "string" ? body.telefone.trim() : "";
  const ativo = typeof body.ativo === "boolean" ? body.ativo : true;

  if (!nome || !crm) {
    return NextResponse.json({ error: "nome e crm são obrigatórios" }, { status: 400 });
  }

  const insert = await supabaseAdmin
    .from("medicos")
    .insert({
      nome,
      crm,
      especialidade: especialidade || null,
      email: email || null,
      telefone: telefone || null,
      ativo,
    })
    .select("id,created_at,nome,crm,especialidade,email,telefone,ativo")
    .single();

  if (insert.error) {
    const msg = insert.error.message || "Falha ao inserir médico";
    // index único em crm pode estourar
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ data: insert.data as MedicoRow }, { status: 201 });
}

