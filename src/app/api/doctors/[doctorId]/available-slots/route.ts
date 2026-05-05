import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function parseDoctorId(req: Request) {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  // /api/doctors/:doctorId/available-slots
  const doctorIdRaw = parts[parts.length - 2] || "";
  const doctorId = Number(doctorIdRaw);
  return Number.isFinite(doctorId) && doctorId > 0 ? doctorId : null;
}

export async function GET(req: Request) {
  const doctorId = parseDoctorId(req);
  if (!doctorId) return NextResponse.json({ error: "doctor_id inválido" }, { status: 400 });

  const url = new URL(req.url);
  const date = url.searchParams.get("date")?.trim() || "";
  if (!date) return NextResponse.json({ error: "date é obrigatório" }, { status: 400 });

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const res = await supabaseAdmin
    .from("available_slots")
    .select("id,doctor_id,date,start_time,end_time,status")
    .eq("doctor_id", doctorId)
    .eq("date", date)
    .eq("status", "available")
    .order("start_time", { ascending: true });

  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });

  const out = (res.data || []).map((r) => ({
    slot_id: (r as any).id,
    doctor_id: (r as any).doctor_id,
    date: (r as any).date,
    start_time: String((r as any).start_time || "").slice(0, 5),
    end_time: String((r as any).end_time || "").slice(0, 5),
    status: (r as any).status,
  }));

  return NextResponse.json(out, { status: 200 });
}

