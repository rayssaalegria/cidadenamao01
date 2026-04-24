import { NextResponse } from "next/server";
import { sasiFetch, type SasiAgendamento } from "@/lib/sasi";

export async function GET(req: Request) {
  const token =
    req.headers.get("x-sasi-token") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";

  const profileId = new URL(req.url).searchParams.get("profileId") || "";

  if (!token) {
    return NextResponse.json({ error: "Missing sasi-token" }, { status: 401 });
  }
  if (!profileId) {
    return NextResponse.json({ error: "Missing profileId" }, { status: 400 });
  }

  // A documentação pública não expõe claramente o endpoint de agendamentos nesta view do Swagger UI.
  // Então deixamos configurável por env var e enviamos profileId como query.
  const path = process.env.SASI_AGENDAMENTOS_PATH?.trim() || "/api/v2/providers/agendamentos";
  const url = new URL(path, "https://api.sasi.io");
  url.searchParams.set("profileId", profileId);

  const data = await sasiFetch<SasiAgendamento[]>(url.pathname + url.search, token);
  return NextResponse.json({ profileId, data }, { status: 200 });
}

