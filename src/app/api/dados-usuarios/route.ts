import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sasiFetch, type SasiMeResponse } from "@/lib/sasi";

type Body = {
  cpf?: string;
  nome?: string;
  sasi_me: unknown;
  draft_overrides: unknown;
  profile_photo?: string | null;
  qr_payload?: string | null;
};

export async function GET(req: Request) {
  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const cpf = new URL(req.url).searchParams.get("cpf")?.trim() || "";
  if (!cpf) {
    return NextResponse.json({ error: "cpf é obrigatório" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("dados_usuarios")
    .select("cpf,nome,sasi_me,draft_overrides,profile_photo,qr_payload,created_at,updated_at")
    .eq("cpf", cpf)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  return NextResponse.json({ data }, { status: 200 });
}

export async function POST(req: Request) {
  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const token =
    req.headers.get("x-sasi-token") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";

  let cpf = typeof body.cpf === "string" ? body.cpf.trim() : "";
  let nome = typeof body.nome === "string" ? body.nome.trim() : "";

  if (token) {
    const me = await sasiFetch<SasiMeResponse>("/api/v2/providers/external/me", token);
    const cpfFromMe = (me.profileProps?.cpf || "").trim();
    const nomeFromMe = (me.profileProps?.name || me.name || "").trim();
    if (cpfFromMe) cpf = cpfFromMe;
    if (nomeFromMe) nome = nomeFromMe;
  }

  if (!cpf || !nome) {
    return NextResponse.json({ error: "cpf e nome são obrigatórios" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("dados_usuarios").upsert(
    {
      cpf,
      nome,
      sasi_me: body.sasi_me ?? null,
      draft_overrides: body.draft_overrides ?? null,
      profile_photo: body.profile_photo ?? null,
      qr_payload: body.qr_payload ?? null,
    },
    { onConflict: "cpf" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

