import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type BulkBody = { csv?: unknown };

type MedicoUpsert = {
  nome: string;
  crm: string;
  especialidade: string | null;
  ativo: boolean;
};

function normalizeHeader(h: string) {
  return h.trim().toLowerCase();
}

function splitCsvLine(line: string, delimiter: "," | ";") {
  // CSV simples com suporte a aspas duplas (")
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch === delimiter) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function detectDelimiter(headerLine: string): "," | ";" {
  const commas = (headerLine.match(/,/g) || []).length;
  const semis = (headerLine.match(/;/g) || []).length;
  return semis > commas ? ";" : ",";
}

function parseCsv(csvRaw: string): { rows: MedicoUpsert[]; errors: string[] } {
  const errors: string[] = [];
  const csv = csvRaw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!csv) return { rows: [], errors: ["CSV vazio"] };

  const lines = csv.split("\n").filter((l) => l.trim().length);
  if (lines.length < 2) return { rows: [], errors: ["CSV deve ter cabeçalho e pelo menos 1 linha"] };

  const delimiter = detectDelimiter(lines[0]!);
  const headers = splitCsvLine(lines[0]!, delimiter).map(normalizeHeader);

  const idxNome = headers.indexOf("nome");
  const idxCrm = headers.indexOf("crm");
  const idxEspecialidade = headers.indexOf("especialidade");
  const idxAtivo = headers.indexOf("ativo");

  if (idxNome < 0 || idxCrm < 0) {
    errors.push('Cabeçalho obrigatório: "nome" e "crm"');
    return { rows: [], errors };
  }

  const rows: MedicoUpsert[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!, delimiter);
    const nome = (cols[idxNome] || "").trim();
    const crm = (cols[idxCrm] || "").trim();
    const especialidade = idxEspecialidade >= 0 ? (cols[idxEspecialidade] || "").trim() : "";
    const ativoRaw = idxAtivo >= 0 ? (cols[idxAtivo] || "").trim().toLowerCase() : "";

    if (!nome || !crm) {
      errors.push(`Linha ${i + 1}: nome/crm ausente`);
      continue;
    }

    const ativo =
      ativoRaw === "false" || ativoRaw === "0" || ativoRaw === "nao" || ativoRaw === "não"
        ? false
        : true;

    rows.push({
      nome,
      crm,
      especialidade: especialidade || null,
      ativo,
    });
  }

  return { rows, errors };
}

export async function POST(req: Request) {
  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuração do Supabase ausente";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let body: BulkBody;
  try {
    body = (await req.json()) as BulkBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const csv = typeof body.csv === "string" ? body.csv : "";
  const parsed = parseCsv(csv);
  if (parsed.errors.length) {
    return NextResponse.json({ error: "CSV inválido", details: parsed.errors }, { status: 400 });
  }
  if (!parsed.rows.length) {
    return NextResponse.json({ error: "Nenhuma linha válida no CSV" }, { status: 400 });
  }

  const res = await supabaseAdmin.from("medicos").upsert(parsed.rows, { onConflict: "crm" }).select("id");
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });

  return NextResponse.json(
    { ok: true, upserted: parsed.rows.length, errors: parsed.errors },
    { status: 200 },
  );
}

