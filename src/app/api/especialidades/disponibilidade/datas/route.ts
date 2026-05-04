import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const especialidade = url.searchParams.get("especialidade")?.trim() || "";

  if (!especialidade) {
    return NextResponse.json({ error: "especialidade é obrigatória" }, { status: 400 });
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from("especialidade_disponibilidade")
    .select("data")
    .eq("especialidade_value", especialidade)
    .eq("ativo", true)
    .gte("data", today)
    .order("data", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const dates = Array.from(new Set((data || []).map((r) => String((r as { data: string }).data))));
  return NextResponse.json({ dates }, { status: 200 });
}

