import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type PacienteItem = {
  cpf: number;
  nome: string | null;
  agendamentos: {
    id: number;
    tipo: string | null;
    especialidade_agendar: string | null;
    data_consulta_date: string | null;
    horario_consulta_time: string | null;
    local_consulta: string | null;
    status: string | null;
  }[];
};

function isoTodayLocal() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function GET(req: Request) {
  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const url = new URL(req.url);
  const date = url.searchParams.get("date")?.trim() || isoTodayLocal();
  const especialidade = url.searchParams.get("especialidade")?.trim() || "";

  let q = supabaseAdmin
    .from("agendamento")
    .select("id,nome_completo,cpf,tipo,especialidade_agendar,data_consulta_date,horario_consulta_time,local_consulta,status")
    .eq("data_consulta_date", date)
    .order("horario_consulta_time", { ascending: true });

  if (especialidade) q = q.eq("especialidade_agendar", especialidade);

  const res = await q;
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });

  const rows = (res.data || []) as {
    id: number;
    nome_completo: string | null;
    cpf: number | null;
    tipo: string | null;
    especialidade_agendar: string | null;
    data_consulta_date: string | null;
    horario_consulta_time: string | null;
    local_consulta: string | null;
    status: string | null;
  }[];

  const byCpf = new Map<number, PacienteItem>();
  for (const r of rows) {
    const cpf = typeof r.cpf === "number" ? r.cpf : null;
    if (!cpf) continue;
    const item =
      byCpf.get(cpf) ||
      ({
        cpf,
        nome: r.nome_completo || null,
        agendamentos: [],
      } satisfies PacienteItem);
    item.agendamentos.push({
      id: r.id,
      tipo: r.tipo,
      especialidade_agendar: r.especialidade_agendar,
      data_consulta_date: r.data_consulta_date,
      horario_consulta_time: r.horario_consulta_time,
      local_consulta: r.local_consulta,
      status: r.status,
    });
    byCpf.set(cpf, item);
  }

  const data = Array.from(byCpf.values()).sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
  return NextResponse.json({ data }, { status: 200 });
}

