import { NextResponse } from "next/server";
import { sasiFetch, type SasiMeResponse } from "@/lib/sasi";

export async function GET(req: Request) {
  const token =
    req.headers.get("x-sasi-token") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";

  if (!token) {
    return NextResponse.json(
      { error: "Missing sasi-token" },
      { status: 401 },
    );
  }

  // Swagger docs list this endpoint under Providers:
  // GET /api/v2/providers/external/me
  const me = await sasiFetch<SasiMeResponse>("/api/v2/providers/external/me", token);
  return NextResponse.json(me, { status: 200 });
}

