import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const url = new URL(req.url);
  const exameId = Number(url.searchParams.get("exameId") || "");
  const date = (url.searchParams.get("date") || "").trim(); // YYYY-MM-DD

  if (!Number.isFinite(exameId) || exameId <= 0) {
    return NextResponse.json({ error: "exameId é obrigatório" }, { status: 400 });
  }

  if (!date) {
    const { data, error } = await supabaseAdmin
      .from("agendamento_disponibilidade")
      .select("data")
      .eq("exame_id", exameId)
      .eq("ativo", true)
      .gte("data", new Date().toISOString().slice(0, 10))
      .order("data", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const dates = Array.from(new Set((data || []).map((r) => String((r as { data: string }).data))));
    return NextResponse.json({ dates }, { status: 200 });
  }

  const { data, error } = await supabaseAdmin
    .from("agendamento_disponibilidade")
    .select("id,horario,agendamento_local!inner(id,nome)")
    .eq("exame_id", exameId)
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

