import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function parseDoctorId(req: Request) {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  // /api/doctors/:doctorId/available-dates
  const doctorIdRaw = parts[parts.length - 2] || "";
  const doctorId = Number(doctorIdRaw);
  return Number.isFinite(doctorId) && doctorId > 0 ? doctorId : null;
}

function monthRange(month: string) {
  // month: YYYY-MM
  const m = /^(\d{4})-(\d{2})$/.exec(month.trim());
  if (!m) return null;
  const yy = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || mm < 1 || mm > 12) return null;
  const start = `${m[1]}-${m[2]}-01`;
  const next = new Date(yy, mm, 1); // next month (mm is 1-based here)
  const end = next.toISOString().slice(0, 10); // exclusive upper bound
  return { start, end };
}

export async function GET(req: Request) {
  const doctorId = parseDoctorId(req);
  if (!doctorId) return NextResponse.json({ error: "doctor_id inválido" }, { status: 400 });

  const url = new URL(req.url);
  const month = url.searchParams.get("month")?.trim() || "";
  const range = monthRange(month);
  if (!range) return NextResponse.json({ error: "month inválido (use YYYY-MM)" }, { status: 400 });

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const res = await supabaseAdmin
    .from("available_slots")
    .select("date")
    .eq("doctor_id", doctorId)
    .eq("status", "available")
    .gte("date", range.start)
    .lt("date", range.end)
    .order("date", { ascending: true });

  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });

  const dates = Array.from(
    new Set(
      (res.data || [])
        .map((r) => String((r as any).date || "").slice(0, 10))
        .filter(Boolean),
    ),
  );

  return NextResponse.json({ dates }, { status: 200 });
}

