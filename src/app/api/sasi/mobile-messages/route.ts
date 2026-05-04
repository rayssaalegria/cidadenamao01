import { NextResponse } from "next/server";
import { sasiPost } from "@/lib/sasi";

type MobileMessage = {
  text: string;
  data: unknown;
  test: boolean;
  ChannelId: number;
  generatedAt: string;
  attachments: unknown[];
  anonymous: boolean;
  dataComments: Record<string, unknown>;
  dataAttachments: Record<string, unknown>;
  dataAttachmentsFiles: Record<string, unknown>;
  attachmentsFiles: unknown[];
  location: { lat: number; lng: number };
  appVersionNumber: number;
};

type Body = {
  profileId?: unknown;
  message?: unknown;
};

function getMonitorToken(req: Request) {
  const fromEnv = (process.env.SASI_MONITOR_TOKEN || "").trim();
  if (fromEnv) return fromEnv;
  return (
    req.headers.get("x-sasi-monitor-token") ||
    req.headers.get("x-sasi-token") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  ).trim();
}

export async function POST(req: Request) {
  const token = getMonitorToken(req);
  if (!token) {
    return NextResponse.json({ error: "Missing SASI monitor token" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const profileId =
    (typeof body.profileId === "string" && body.profileId.trim()) ||
    (typeof body.profileId === "number" && Number.isFinite(body.profileId) ? String(body.profileId) : "") ||
    "";
  if (!profileId) {
    return NextResponse.json({ error: "profileId é obrigatório" }, { status: 400 });
  }

  const message = body.message as MobileMessage;
  if (!message || typeof message !== "object") {
    return NextResponse.json({ error: "message é obrigatório" }, { status: 400 });
  }

  const data = await sasiPost<unknown>(
    `/api/v2/mobile/profiles/${encodeURIComponent(profileId)}/messages`,
    token,
    message,
  );

  return NextResponse.json({ ok: true, data }, { status: 200 });
}

