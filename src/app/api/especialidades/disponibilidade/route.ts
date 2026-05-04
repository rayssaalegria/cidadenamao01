import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type CreateBody = {
  especialidadeValue: string;
  localId: number;
  data: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  intervalMinutes: number; // 15
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parseHHmm(value: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const especialidadeValue = url.searchParams.get("especialidade")?.trim() || "";
  const localId = Number(url.searchParams.get("localId") || "");
  const data = url.searchParams.get("data")?.trim() || "";

  if (!especialidadeValue || !Number.isFinite(localId) || !data) {
    return NextResponse.json({ error: "especialidade, localId e data são obrigatórios" }, { status: 400 });
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data: rows, error } = await supabaseAdmin
    .from("especialidade_disponibilidade")
    .select("id,data,horario,ativo")
    .eq("especialidade_value", especialidadeValue)
    .eq("local_id", localId)
    .eq("data", data)
    .order("horario", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: rows || [] }, { status: 200 });
}

export async function POST(req: Request) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const especialidadeValue = typeof body.especialidadeValue === "string" ? body.especialidadeValue.trim() : "";
  const localId = Number(body.localId);
  const data = typeof body.data === "string" ? body.data.trim() : "";
  const intervalMinutes = Number(body.intervalMinutes);
  const start = typeof body.startTime === "string" ? parseHHmm(body.startTime) : null;
  const end = typeof body.endTime === "string" ? parseHHmm(body.endTime) : null;

  if (!especialidadeValue || !Number.isFinite(localId) || !data || !start || !end || intervalMinutes !== 15) {
    return NextResponse.json(
      { error: "especialidadeValue, localId, data, startTime, endTime e intervalMinutes(15) são obrigatórios" },
      { status: 400 },
    );
  }

  const startMin = start.hh * 60 + start.mm;
  const endMin = end.hh * 60 + end.mm;
  if (endMin <= startMin) return NextResponse.json({ error: "endTime deve ser maior que startTime" }, { status: 400 });

  const slots: Array<{ especialidade_value: string; local_id: number; data: string; horario: string; ativo: boolean }> = [];
  for (let t = startMin; t + intervalMinutes <= endMin; t += intervalMinutes) {
    const hh = Math.floor(t / 60);
    const mm = t % 60;
    slots.push({
      especialidade_value: especialidadeValue,
      local_id: localId,
      data,
      horario: `${pad(hh)}:${pad(mm)}:00`,
      ativo: true,
    });
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { error } = await supabaseAdmin.from("especialidade_disponibilidade").upsert(slots, {
    onConflict: "especialidade_value,local_id,data,horario",
    ignoreDuplicates: false,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, created: slots.length }, { status: 200 });
}

