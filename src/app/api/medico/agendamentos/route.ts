import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function toNumericOrNull(value: string) {
  const d = digitsOnly(value);
  if (!d) return null;
  const n = Number(d);
  return Number.isFinite(n) ? n : null;
}

function isoTodayLocal() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type AgendamentoRow = {
  id: number;
  created_at: string;
  nome_completo: string | null;
  cpf: number | null;
  especialidade_agendar: string | null;
  tipo: string | null;
  data_consulta_date: string | null;
  horario_consulta_time: string | null;
  local_consulta: string | null;
  status: string | null;
};

export async function GET(req: Request) {
  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const url = new URL(req.url);
  const cpf = url.searchParams.get("cpf")?.trim() || "";
  const scope = url.searchParams.get("scope")?.trim() || "future"; // history | future | all
  const especialidade = url.searchParams.get("especialidade")?.trim() || "";

  if (!cpf) return NextResponse.json({ error: "cpf é obrigatório" }, { status: 400 });
  const cpfNum = toNumericOrNull(cpf);
  if (cpfNum === null) return NextResponse.json({ error: "CPF inválido" }, { status: 400 });

  const today = isoTodayLocal();

  let q = supabaseAdmin
    .from("agendamento")
    .select(
      "id,created_at,nome_completo,cpf,especialidade_agendar,tipo,data_consulta_date,horario_consulta_time,local_consulta,status",
    )
    .eq("cpf", cpfNum)
    .order("data_consulta_date", { ascending: false })
    .order("horario_consulta_time", { ascending: false });

  if (especialidade) q = q.eq("especialidade_agendar", especialidade);
  if (scope === "history") q = q.lt("data_consulta_date", today);
  if (scope === "future") q = q.gte("data_consulta_date", today);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: (data || []) as AgendamentoRow[] }, { status: 200 });
}

