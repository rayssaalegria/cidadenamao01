import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sasiFetch, type SasiMeResponse } from "@/lib/sasi";

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function toNumericOrNull(value: string) {
  const d = digitsOnly(value);
  if (!d) return null;
  const n = Number(d);
  return Number.isFinite(n) ? n : null;
}

type CreateBody = {
  cpf?: string;
  nome?: string;
  carteiraSus?: string | null;
  // Para tipo=especialidade: `especialidade` é o label (ex: "Clínica Geral")
  // Para tipo=exame: `especialidade` é o nome do exame (ex: "Eletrocardiograma")
  especialidade: string;
  // Para tipo=especialidade: usado para casar com `especialidade_catalogo.value`
  especialidadeValue?: string | null;
  tipo?: "especialidade" | "exame";
  localId?: number | null;
  exameId?: number | null;
  dataConsulta: string; // YYYY-MM-DD
  horarioConsulta: string; // HH:mm
  localConsulta: string;
  qrCode?: string | null;
  doctorId?: number | null;
  slotId?: number | null;
};

type PatchBody = {
  id?: unknown;
  status?: unknown;
};

type AgendamentoExameRow = {
  id: number;
  nome: string | null;
  ativo?: boolean | null;
};

export async function GET(req: Request) {
  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const url = new URL(req.url);
  const cpfQuery = url.searchParams.get("cpf")?.trim() || "";
  const nomeQuery = url.searchParams.get("nome")?.trim() || "";
  const status = url.searchParams.get("status")?.trim() || "";
  const tipo = url.searchParams.get("tipo")?.trim() || "";

  const token =
    req.headers.get("x-sasi-token") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";

  let cpf = cpfQuery;
  let nome = nomeQuery;

  // Se abriu a página via WebView e só temos SASI token,
  // buscamos o CPF (e nome) via /me para não depender de querystring.
  if (!cpf && token) {
    try {
      const me = await sasiFetch<SasiMeResponse>("/api/v2/providers/external/me", token);
      cpf = (me.profileProps?.cpf || "").trim();
      nome = (me.profileProps?.name || me.name || "").trim();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao buscar dados no SASI";
      return NextResponse.json({ error: message }, { status: 401 });
    }
  }

  if (!cpf) return NextResponse.json({ error: "cpf é obrigatório" }, { status: 400 });

  // 1) Sempre resolve os agendamentos via tabela de vínculo (cpf/nome -> agendamento_id)
  const cpfDigits = digitsOnly(cpf);
  const cpfCandidates = Array.from(new Set([cpf.trim(), cpfDigits].filter(Boolean)));

  let pessoaQ = supabaseAdmin.from("agendamento_pessoa").select("agendamento_id,cpf,nome");
  if (cpfCandidates.length === 1) pessoaQ = pessoaQ.eq("cpf", cpfCandidates[0]);
  else pessoaQ = pessoaQ.in("cpf", cpfCandidates);

  // Se nome vier explicitamente na query, usamos como filtro também.
  // Se nome veio do SASI (fallback), não filtramos aqui para não "sumir" registros por divergência de grafia.
  if (nomeQuery) pessoaQ = pessoaQ.ilike("nome", `%${nomeQuery}%`);

  const pessoaRes = await pessoaQ;
  if (pessoaRes.error) return NextResponse.json({ error: pessoaRes.error.message }, { status: 500 });

  const agendamentoIds = (pessoaRes.data || [])
    .map((r) => (r as { agendamento_id?: unknown }).agendamento_id)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);

  if (!agendamentoIds.length) {
    return NextResponse.json({ data: [] }, { status: 200 });
  }

  // 2) Carrega dados do agendamento pelos IDs encontrados
  let q = supabaseAdmin
    .from("agendamento")
    .select(
      "id,created_at,nome_completo,cpf,carteira_sus,especialidade_agendar,tipo,data_consulta_date,horario_consulta_time,local_consulta,status,qr_code,medico_id,medico_nome,slot_id",
    )
    .in("id", agendamentoIds)
    .order("created_at", { ascending: false });

  if (status) q = q.eq("status", status);
  if (tipo) {
    // Compatibilidade: registros legados podem ter `tipo` nulo.
    // Para `tipo=especialidade`, tratamos nulo como especialidade (consultas).
    if (tipo === "especialidade") q = q.or("tipo.eq.especialidade,tipo.is.null");
    else q = q.eq("tipo", tipo);
  }

  const [{ data, error }, examesRes] = await Promise.all([
    q,
    // 3) Sempre consulta o catálogo de exames para enriquecer itens do tipo "exame"
    supabaseAdmin.from("agendamento_exame").select("id,nome,ativo").eq("ativo", true).order("nome"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (examesRes.error) return NextResponse.json({ error: examesRes.error.message }, { status: 500 });

  const examesCatalogo = ((examesRes.data || []) as AgendamentoExameRow[]).filter((x) => x?.nome);
  const byNome = new Map(examesCatalogo.map((x) => [String(x.nome || "").trim().toLowerCase(), x]));

  const enriched = (data || []).map((row) => {
    const tipoRow = (row as { tipo?: string | null }).tipo || null;
    const espec = String((row as { especialidade_agendar?: string | null }).especialidade_agendar || "").trim();
    const exame = tipoRow === "exame" && espec ? byNome.get(espec.toLowerCase()) || null : null;
    return { ...row, exame: exame ? { id: exame.id, nome: exame.nome } : null };
  });

  return NextResponse.json({ data: enriched }, { status: 200 });
}

export async function POST(req: Request) {
  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const token =
    req.headers.get("x-sasi-token") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";

  const sasiProfileId = req.headers.get("x-sasi-profile-id") || "";

  let cpf = typeof body.cpf === "string" ? body.cpf.trim() : "";
  let nome = typeof body.nome === "string" ? body.nome.trim() : "";

  // Se tiver SASI token, o CPF/nome "verdadeiros" vêm do SASI (não do body).
  if (token) {
    const me = await sasiFetch<SasiMeResponse>("/api/v2/providers/external/me", token);
    const cpfFromMe = (me.profileProps?.cpf || "").trim();
    const nomeFromMe = (me.profileProps?.name || me.name || "").trim();
    if (cpfFromMe) cpf = cpfFromMe;
    if (nomeFromMe) nome = nomeFromMe;
  }

  const especialidade = typeof body.especialidade === "string" ? body.especialidade.trim() : "";
  const tipo = body.tipo === "exame" || body.tipo === "especialidade" ? body.tipo : "";
  const especialidadeValue = typeof body.especialidadeValue === "string" ? body.especialidadeValue.trim() : "";
  const localId = typeof body.localId === "number" && Number.isFinite(body.localId) ? body.localId : null;
  const exameId = typeof body.exameId === "number" && Number.isFinite(body.exameId) ? body.exameId : null;
  const dataConsulta = typeof body.dataConsulta === "string" ? body.dataConsulta.trim() : "";
  const horarioConsulta = typeof body.horarioConsulta === "string" ? body.horarioConsulta.trim() : "";
  const localConsulta = typeof body.localConsulta === "string" ? body.localConsulta.trim() : "";
  const carteiraSus = typeof body.carteiraSus === "string" ? body.carteiraSus.trim() : "";
  const doctorId = typeof body.doctorId === "number" && Number.isFinite(body.doctorId) ? body.doctorId : null;
  const slotId = typeof body.slotId === "number" && Number.isFinite(body.slotId) ? body.slotId : null;

  if (!cpf || !nome || !especialidade || !dataConsulta || !horarioConsulta || !localConsulta) {
    return NextResponse.json(
      { error: "cpf, nome, especialidade, dataConsulta, horarioConsulta e localConsulta são obrigatórios" },
      { status: 400 },
    );
  }

  const cpfNum = toNumericOrNull(cpf);
  if (cpfNum === null) return NextResponse.json({ error: "CPF inválido" }, { status: 400 });

  const susNum = carteiraSus ? toNumericOrNull(carteiraSus) : null;

  // Se vier doctorId+slotId, valida e "reserva" o slot (available -> booked) antes de inserir o agendamento.
  // Isso impede que o mesmo horário apareça como disponível para outros pacientes.
  let medicoNome: string | null = null;
  let bookedSlot: { id: number } | null = null;
  if (doctorId && slotId) {
    const medicoRes = await supabaseAdmin.from("medicos").select("id,nome").eq("id", doctorId).single();
    if (medicoRes.error) return NextResponse.json({ error: medicoRes.error.message }, { status: 500 });
    if (!medicoRes.data) return NextResponse.json({ error: "Médico não encontrado" }, { status: 404 });
    medicoNome = String((medicoRes.data as { nome?: unknown }).nome || "").trim() || null;

    // Confere se o slot é do médico, é da data/horário informados, e ainda está disponível.
    const slotRow = await supabaseAdmin
      .from("available_slots")
      .select("id,doctor_id,date,start_time,status")
      .eq("id", slotId)
      .single();
    if (slotRow.error) return NextResponse.json({ error: slotRow.error.message }, { status: 500 });
    if (!slotRow.data) return NextResponse.json({ error: "Horário não encontrado" }, { status: 404 });

    const slotDoctorId = (slotRow.data as { doctor_id?: unknown }).doctor_id;
    const slotDate = String((slotRow.data as { date?: unknown }).date || "");
    const slotStart = String((slotRow.data as { start_time?: unknown }).start_time || "").slice(0, 5);
    const slotStatus = String((slotRow.data as { status?: unknown }).status || "");

    if (slotDoctorId !== doctorId || slotDate !== dataConsulta || slotStart !== horarioConsulta) {
      return NextResponse.json({ error: "Horário não corresponde ao médico/data/horário informados" }, { status: 400 });
    }

    if (slotStatus !== "available") {
      return NextResponse.json({ error: "Horário indisponível" }, { status: 409 });
    }

    // Reserva com condição (só atualiza se ainda estiver available).
    const bookRes = await supabaseAdmin
      .from("available_slots")
      .update({ status: "booked", updated_at: new Date().toISOString() })
      .eq("id", slotId)
      .eq("status", "available")
      .select("id")
      .single();

    if (bookRes.error) return NextResponse.json({ error: bookRes.error.message }, { status: 500 });
    if (!bookRes.data) return NextResponse.json({ error: "Horário indisponível" }, { status: 409 });
    bookedSlot = bookRes.data as { id: number };
  }

  const insertRes = await supabaseAdmin
    .from("agendamento")
    .insert({
      nome_completo: nome,
      cpf: cpfNum,
      carteira_sus: susNum,
      especialidade_agendar: especialidade,
      tipo: tipo || null,
      data_consulta_date: dataConsulta,
      horario_consulta_time: horarioConsulta,
      local_consulta: localConsulta,
      qr_code: body.qrCode ?? null,
      status: "Agendada",
      sasi_profile_id: sasiProfileId || null,
      sasi_token: token || null,
      medico_id: doctorId,
      medico_nome: medicoNome,
      slot_id: bookedSlot?.id || null,
    })
    .select(
      "id,created_at,nome_completo,cpf,carteira_sus,especialidade_agendar,data_consulta_date,horario_consulta_time,local_consulta,status,qr_code,sasi_profile_id,sasi_token,medico_id,medico_nome,slot_id",
    )
    .single();

  if (insertRes.error) {
    // Compensação: se reservamos slot, mas falhou inserir agendamento, devolve o slot para available.
    if (doctorId && slotId) {
      await supabaseAdmin
        .from("available_slots")
        .update({ status: "available", updated_at: new Date().toISOString() })
        .eq("id", slotId)
        .eq("status", "booked");
    }
    return NextResponse.json({ error: insertRes.error.message }, { status: 500 });
  }

  const agendamentoId = insertRes.data?.id;
  if (!agendamentoId) return NextResponse.json({ error: "Falha ao criar agendamento" }, { status: 500 });

  const { error: linkErr } = await supabaseAdmin.from("agendamento_pessoa").insert({
    agendamento_id: agendamentoId,
    cpf,
    nome,
  });

  if (linkErr) {
    // Evita deixar agendamento "órfão" sem vínculo com o solicitante
    await supabaseAdmin.from("agendamento").delete().eq("id", agendamentoId);
    if (doctorId && slotId) {
      await supabaseAdmin
        .from("available_slots")
        .update({ status: "available", updated_at: new Date().toISOString() })
        .eq("id", slotId)
        .eq("status", "booked");
    }
    return NextResponse.json({ error: `Falha ao vincular solicitante: ${linkErr.message}` }, { status: 500 });
  }

  // Marca o slot como ocupado (ativo=false) para não aparecer mais na disponibilidade
  if (tipo === "especialidade" && especialidadeValue && localId && dataConsulta && horarioConsulta) {
    await supabaseAdmin
      .from("especialidade_disponibilidade")
      .update({ ativo: false })
      .eq("especialidade_value", especialidadeValue)
      .eq("local_id", localId)
      .eq("data", dataConsulta)
      .eq("horario", `${horarioConsulta}:00`);
  }
  if (tipo === "exame" && exameId && localId && dataConsulta && horarioConsulta) {
    await supabaseAdmin
      .from("agendamento_disponibilidade")
      .update({ ativo: false })
      .eq("exame_id", exameId)
      .eq("local_id", localId)
      .eq("data", dataConsulta)
      .eq("horario", `${horarioConsulta}:00`);
  }

  return NextResponse.json({ ok: true, id: agendamentoId, row: insertRes.data }, { status: 200 });
}

export async function PATCH(req: Request) {
  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const id = typeof body.id === "number" && Number.isFinite(body.id) ? body.id : Number(body.id);
  const status = typeof body.status === "string" ? body.status.trim() : "";

  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
  if (!status) return NextResponse.json({ error: "status é obrigatório" }, { status: 400 });

  // Permitimos apenas cancelamento por enquanto
  if (status !== "Cancelada") {
    return NextResponse.json({ error: "status inválido" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("agendamento").update({ status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true }, { status: 200 });
}

