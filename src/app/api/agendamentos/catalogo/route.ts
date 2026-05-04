import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const [examesRes, locaisRes] = await Promise.all([
    supabaseAdmin.from("agendamento_exame").select("id,nome").eq("ativo", true).order("nome"),
    supabaseAdmin.from("agendamento_local").select("id,nome").eq("ativo", true).order("nome"),
  ]);

  if (examesRes.error) return NextResponse.json({ error: examesRes.error.message }, { status: 500 });
  if (locaisRes.error) return NextResponse.json({ error: locaisRes.error.message }, { status: 500 });

  return NextResponse.json(
    {
      exames: examesRes.data || [],
      locais: locaisRes.data || [],
    },
    { status: 200 },
  );
}

