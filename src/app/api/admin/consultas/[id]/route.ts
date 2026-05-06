import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const consultaId = Number(id);

  if (!Number.isFinite(consultaId) || consultaId <= 0) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const res = await supabaseAdmin
    .from("agendamento")
    .select(
      "id,created_at,nome_completo,cpf,carteira_sus,especialidade_agendar,tipo,data_consulta_date,horario_consulta_time,local_consulta,status,medico_id,medico_nome,slot_id,channel_id",
    )
    .eq("id", consultaId)
    .single();

  if (res.error) {
    // PostgREST: PGRST116 (no rows) ou similar
    const msg = res.error.message || "Falha ao buscar consulta";
    const notFound = msg.toLowerCase().includes("0 rows") || msg.toLowerCase().includes("no rows");
    return NextResponse.json({ error: notFound ? "Consulta não encontrada" : msg }, { status: notFound ? 404 : 500 });
  }

  return NextResponse.json({ data: res.data }, { status: 200 });
}

