import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function parseSlotId(req: Request) {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const slotIdRaw = parts[parts.length - 1] || "";
  const slotId = Number(slotIdRaw);
  return Number.isFinite(slotId) && slotId > 0 ? slotId : null;
}

export async function DELETE(req: Request) {
  const slotId = parseSlotId(req);
  if (!slotId) return NextResponse.json({ error: "slotId inválido" }, { status: 400 });

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Regra: não excluir slots booked. Só permitir futuro (>= hoje) e não-booked.
  const current = await supabaseAdmin
    .from("available_slots")
    .select("id,date,start_time,status")
    .eq("id", slotId)
    .single();

  if (current.error) return NextResponse.json({ error: current.error.message }, { status: 500 });
  if (!current.data) return NextResponse.json({ error: "Slot não encontrado" }, { status: 404 });

  const status = String((current.data as { status?: unknown }).status || "");
  if (status === "booked") return NextResponse.json({ error: "Slot ocupado não pode ser excluído" }, { status: 400 });

  const date = String((current.data as { date?: unknown }).date || "");
  const todayIso = new Date().toISOString().slice(0, 10);
  if (date && date < todayIso) {
    return NextResponse.json({ error: "Só é permitido excluir horários futuros" }, { status: 400 });
  }

  const del = await supabaseAdmin.from("available_slots").delete().eq("id", slotId);
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 500 });

  return NextResponse.json({ ok: true }, { status: 200 });
}

