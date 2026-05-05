import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type SlotStatus = "available" | "booked" | "blocked" | "cancelled";

function parseDoctorId(req: Request) {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const doctorIdRaw = parts[parts.length - 2] || "";
  const doctorId = Number(doctorIdRaw);
  return Number.isFinite(doctorId) && doctorId > 0 ? doctorId : null;
}

export async function GET(req: Request) {
  const doctorId = parseDoctorId(req);
  if (!doctorId) return NextResponse.json({ error: "doctorId inválido" }, { status: 400 });

  const url = new URL(req.url);
  const date = url.searchParams.get("date")?.trim() || "";
  const status = url.searchParams.get("status")?.trim() || "";

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let q = supabaseAdmin
    .from("available_slots")
    .select("id,doctor_id,availability_id,date,start_time,end_time,status,created_at,updated_at")
    .eq("doctor_id", doctorId)
    .order("date", { ascending: false })
    .order("start_time", { ascending: true });

  if (date) q = q.eq("date", date);
  if (status) q = q.eq("status", status);

  const res = await q;
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  return NextResponse.json({ data: res.data || [] }, { status: 200 });
}

type PatchBody = {
  slotId?: unknown;
  status?: unknown;
};

export async function PATCH(req: Request) {
  const doctorId = parseDoctorId(req);
  if (!doctorId) return NextResponse.json({ error: "doctorId inválido" }, { status: 400 });

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const slotId = typeof body.slotId === "number" && Number.isFinite(body.slotId) ? body.slotId : Number(body.slotId);
  const status = typeof body.status === "string" ? body.status.trim() : "";
  if (!Number.isFinite(slotId) || slotId <= 0) return NextResponse.json({ error: "slotId inválido" }, { status: 400 });

  const allowed: SlotStatus[] = ["available", "blocked"];
  if (!allowed.includes(status as SlotStatus)) {
    return NextResponse.json({ error: "status inválido (use available|blocked)" }, { status: 400 });
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Regras: não mexer em slots booked
  const current = await supabaseAdmin
    .from("available_slots")
    .select("id,doctor_id,status,date,start_time")
    .eq("id", slotId)
    .single();

  if (current.error) return NextResponse.json({ error: current.error.message }, { status: 500 });
  if (!current.data) return NextResponse.json({ error: "Slot não encontrado" }, { status: 404 });
  if ((current.data as { doctor_id?: unknown }).doctor_id !== doctorId) {
    return NextResponse.json({ error: "Slot não pertence ao médico informado" }, { status: 400 });
  }
  if ((current.data as { status?: string }).status === "booked") {
    return NextResponse.json({ error: "Slot ocupado não pode ser alterado" }, { status: 400 });
  }

  const upd = await supabaseAdmin
    .from("available_slots")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", slotId)
    .select("id,doctor_id,availability_id,date,start_time,end_time,status,created_at,updated_at")
    .single();

  if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });
  return NextResponse.json({ data: upd.data }, { status: 200 });
}

