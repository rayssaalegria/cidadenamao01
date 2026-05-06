import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function isoTodayLocal() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const medicoId = Number(url.searchParams.get("medicoId") || "");
  const date = (url.searchParams.get("date") || "").trim(); // YYYY-MM-DD (opcional)
  const scope = (url.searchParams.get("scope") || "future").trim(); // future | history | all
  const status = (url.searchParams.get("status") || "").trim(); // opcional

  if (!Number.isFinite(medicoId) || medicoId <= 0) {
    return NextResponse.json({ error: "medicoId é obrigatório" }, { status: 400 });
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const today = isoTodayLocal();

  let q = supabaseAdmin
    .from("agendamento")
    .select(
      "id,created_at,nome_completo,cpf,especialidade_agendar,tipo,data_consulta_date,horario_consulta_time,local_consulta,status,medico_id,medico_nome",
    )
    .eq("medico_id", medicoId)
    .order("data_consulta_date", { ascending: true })
    .order("horario_consulta_time", { ascending: true });

  if (date) q = q.eq("data_consulta_date", date);
  if (status) q = q.eq("status", status);

  if (scope === "history") q = q.lt("data_consulta_date", today);
  else if (scope === "future") q = q.gte("data_consulta_date", today);

  const res = await q;
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });

  return NextResponse.json({ data: res.data || [] }, { status: 200 });
}

