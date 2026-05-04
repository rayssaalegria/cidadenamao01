import { NextResponse } from "next/server";
import { sasiPost } from "@/lib/sasi";

type Body = {
  messageId?: string;
  payload?: unknown;
};

function stripDebugLines(text: string) {
  return text
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trimStart();
      return !(t.startsWith("DOM Path:") || t.startsWith("Position:") || t.startsWith("HTML Element:"));
    })
    .join("\n")
    .trim();
}

function getChannelId(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const anyP = payload as Record<string, unknown>;
  const direct = anyP.channelId;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  const nestedPayload = anyP.payload;
  if (nestedPayload && typeof nestedPayload === "object") {
    const nested = (nestedPayload as Record<string, unknown>).channelId;
    if (typeof nested === "number" && Number.isFinite(nested)) return nested;
  }
  return null;
}

function sanitizeNotifyPayload(payload: unknown) {
  const channelId = getChannelId(payload);
  if (channelId !== 27329) return payload;

  // Remove informações técnicas do texto quando usado o channelId 27329
  if (typeof payload === "string") return stripDebugLines(payload);
  if (!payload || typeof payload !== "object") return payload;

  const root = payload as Record<string, unknown>;
  const nested = root.payload && typeof root.payload === "object" ? (root.payload as Record<string, unknown>) : null;

  // Caso mais comum: { payload: { text: "..." , channelId: 27329, ... } }
  if (nested && typeof nested.text === "string") {
    return { ...root, payload: { ...nested, text: stripDebugLines(nested.text) } };
  }

  // Fallback: { text: "..." , channelId: 27329, ... }
  if (typeof root.text === "string") {
    return { ...root, text: stripDebugLines(root.text) };
  }

  return payload;
}

export async function POST(req: Request) {
  const token =
    req.headers.get("x-sasi-token") ||
    req.headers.get("authorization")?.replace(/^Bearer\\s+/i, "") ||
    "";

  if (!token) {
    return NextResponse.json({ error: "Missing sasi-token" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const messageId =
    (typeof body.messageId === "string" && body.messageId.trim()) ||
    (process.env.SASI_NOTIFY_MESSAGE_ID || "").trim();
  if (!messageId) {
    return NextResponse.json(
      { error: "Missing messageId (env SASI_NOTIFY_MESSAGE_ID ou body.messageId)" },
      { status: 400 },
    );
  }

  const payload = sanitizeNotifyPayload(body.payload ?? {});
  const data = await sasiPost<unknown>(
    `/api/v2/providers/messages/${encodeURIComponent(messageId)}/notify`,
    token,
    payload,
  );

  return NextResponse.json({ ok: true, data }, { status: 200 });
}

