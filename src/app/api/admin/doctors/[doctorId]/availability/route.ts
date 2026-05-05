import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type CreateBody = {
  date?: unknown; // YYYY-MM-DD
  local?: unknown;
  startTime?: unknown; // HH:mm
  endTime?: unknown; // HH:mm
  appointmentDurationMinutes?: unknown; // int
  intervalMinutes?: unknown; // int (optional)
};

function parseDoctorId(req: Request) {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const doctorIdRaw = parts[parts.length - 2] || "";
  const doctorId = Number(doctorIdRaw);
  return Number.isFinite(doctorId) && doctorId > 0 ? doctorId : null;
}

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
  const doctorId = parseDoctorId(req);
  if (!doctorId) return NextResponse.json({ error: "doctorId inválido" }, { status: 400 });

  const url = new URL(req.url);
  const date = url.searchParams.get("date")?.trim() || "";

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let q = supabaseAdmin
    .from("doctor_availability")
    .select("id,doctor_id,date,start_time,end_time,appointment_duration_minutes,interval_minutes,created_at,updated_at")
    .eq("doctor_id", doctorId)
    .order("date", { ascending: false })
    .order("start_time", { ascending: true });

  if (date) q = q.eq("date", date);

  const res = await q;
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  return NextResponse.json({ data: res.data || [] }, { status: 200 });
}

export async function POST(req: Request) {
  const doctorId = parseDoctorId(req);
  if (!doctorId) return NextResponse.json({ error: "doctorId inválido" }, { status: 400 });

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const date = typeof body.date === "string" ? body.date.trim() : "";
  const local = typeof body.local === "string" ? body.local.trim() : "";
  const start = typeof body.startTime === "string" ? parseHHmm(body.startTime) : null;
  const end = typeof body.endTime === "string" ? parseHHmm(body.endTime) : null;
  const appointmentDurationMinutes = Number(body.appointmentDurationMinutes);
  const intervalMinutesRaw = body.intervalMinutes === undefined || body.intervalMinutes === null ? 0 : Number(body.intervalMinutes);
  const intervalMinutes = Number.isFinite(intervalMinutesRaw) ? intervalMinutesRaw : NaN;

  if (!date || !start || !end || !Number.isFinite(appointmentDurationMinutes) || appointmentDurationMinutes <= 0) {
    return NextResponse.json(
      { error: "date, startTime, endTime e appointmentDurationMinutes são obrigatórios" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(intervalMinutes) || intervalMinutes < 0) {
    return NextResponse.json({ error: "intervalMinutes inválido" }, { status: 400 });
  }

  const startMin = start.hh * 60 + start.mm;
  const endMin = end.hh * 60 + end.mm;
  if (endMin <= startMin) return NextResponse.json({ error: "endTime deve ser maior que startTime" }, { status: 400 });

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // 1) cria a configuração
  const availIns = await supabaseAdmin
    .from("doctor_availability")
    .insert({
      doctor_id: doctorId,
      date,
      local: local || null,
      start_time: `${pad(start.hh)}:${pad(start.mm)}:00`,
      end_time: `${pad(end.hh)}:${pad(end.mm)}:00`,
      appointment_duration_minutes: appointmentDurationMinutes,
      interval_minutes: intervalMinutes,
      updated_at: new Date().toISOString(),
    })
    .select("id,doctor_id,date,local,start_time,end_time,appointment_duration_minutes,interval_minutes,created_at,updated_at")
    .single();

  if (availIns.error) return NextResponse.json({ error: availIns.error.message }, { status: 500 });

  const availabilityId = (availIns.data as { id?: unknown }).id;
  if (typeof availabilityId !== "number") {
    return NextResponse.json({ error: "Falha ao criar disponibilidade" }, { status: 500 });
  }

  // 2) gera slots
  const slots: Array<{
    doctor_id: number;
    availability_id: number;
    date: string;
    local: string | null;
    start_time: string;
    end_time: string;
    status: "available";
    updated_at: string;
  }> = [];

  for (let t = startMin; t + appointmentDurationMinutes <= endMin; ) {
    const hh = Math.floor(t / 60);
    const mm = t % 60;
    const endT = t + appointmentDurationMinutes;
    const ehh = Math.floor(endT / 60);
    const emm = endT % 60;
    slots.push({
      doctor_id: doctorId,
      availability_id: availabilityId,
      date,
      local: local || null,
      start_time: `${pad(hh)}:${pad(mm)}:00`,
      end_time: `${pad(ehh)}:${pad(emm)}:00`,
      status: "available",
      updated_at: new Date().toISOString(),
    });
    t = endT + intervalMinutes;
  }

  if (!slots.length) {
    return NextResponse.json({ error: "Nenhum slot gerado com essa configuração" }, { status: 400 });
  }

  // 3) upsert com regra de unicidade por (doctor_id,date,start_time)
  const upsert = await supabaseAdmin.from("available_slots").upsert(slots, {
    onConflict: "doctor_id,date,start_time",
    ignoreDuplicates: false,
  });

  if (upsert.error) return NextResponse.json({ error: upsert.error.message }, { status: 500 });

  return NextResponse.json(
    { ok: true, availability: availIns.data, slotsCreated: slots.length },
    { status: 201 },
  );
}

