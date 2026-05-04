import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const especialidade = url.searchParams.get("especialidade")?.trim() || "";
  const date = (url.searchParams.get("date") || "").trim(); // YYYY-MM-DD

  if (!especialidade) return NextResponse.json({ error: "especialidade é obrigatória" }, { status: 400 });
  if (!date) return NextResponse.json({ error: "date é obrigatório" }, { status: 400 });

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from("especialidade_disponibilidade")
    .select("id,horario,agendamento_local!inner(id,nome)")
    .eq("especialidade_value", especialidade)
    .eq("ativo", true)
    .eq("data", date)
    .order("horario", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const slots = (data || []).map((r) => {
    const row = r as unknown as {
      id: number;
      horario: string; // HH:mm:ss
      agendamento_local: { id: number; nome: string } | null;
    };
    return {
      id: row.id,
      time: row.horario?.slice(0, 5) || "",
      localId: row.agendamento_local?.id || null,
      local: row.agendamento_local?.nome || "",
    };
  });

  return NextResponse.json({ slots }, { status: 200 });
}

