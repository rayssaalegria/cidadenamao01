import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type PatchBody = {
  nome?: unknown;
  crm?: unknown;
  especialidade?: unknown;
  email?: unknown;
  telefone?: unknown;
  ativo?: unknown;
};

function parseId(req: Request) {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const idRaw = parts[parts.length - 1] || "";
  const id = Number(idRaw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function PATCH(req: Request) {
  const id = parseId(req);
  if (!id) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.nome === "string") patch.nome = body.nome.trim();
  if (typeof body.crm === "string") patch.crm = body.crm.trim();
  if (typeof body.especialidade === "string") patch.especialidade = body.especialidade.trim() || null;
  if (typeof body.email === "string") patch.email = body.email.trim() || null;
  if (typeof body.telefone === "string") patch.telefone = body.telefone.trim() || null;
  if (typeof body.ativo === "boolean") patch.ativo = body.ativo;
  patch.updated_at = new Date().toISOString();

  const res = await supabaseAdmin
    .from("medicos")
    .update(patch)
    .eq("id", id)
    .select("id,created_at,nome,crm,especialidade,email,telefone,ativo")
    .single();

  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  if (!res.data) return NextResponse.json({ error: "Médico não encontrado" }, { status: 404 });

  return NextResponse.json({ data: res.data }, { status: 200 });
}

