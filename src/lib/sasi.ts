export type SasiProfile = {
  id: string;
  name?: string | null;
  role?: string | null;
  status?: string | null;
  customProps?: {
    email?: string | null;
    phone?: string | null;
    code?: string | null;
  } | null;
  profileProps?: {
    cpf?: string | null;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    renda?: string | null;
    genero?: string | null;
    profissao?: string | null;
    pessoal_uf?: string | null;
    pessoal_cep?: string | null;
    pessoal_rua?: string | null;
    pessoal_numero?: string | null;
    escolaridade?: string | null;
    estado_civil?: string | null;
    documento_sus?: string | null;
    documento_rg?: string | null;
    pessoal_bairro?: string | null;
    pessoal_cidade?: string | null;
    data_nascimento?: string | null;
    pessoal_complemento?: string | null;
  } | null;
  App?: {
    id: number;
    name?: string | null;
    config?: {
      primaryColor?: string | null;
      secondaryColor?: string | null;
      textColor?: string | null;
      headerColor?: string | null;
      backgroundColor?: string | null;
      secondaryBackgroundColor?: string | null;
      banner?: { url?: string | null } | null;
    } | null;
  } | null;
};

export type SasiMeResponse = SasiProfile;

export type SasiAgendamento = Record<string, unknown>;

export function getSasiBaseUrl() {
  return process.env.SASI_BASE_URL?.trim() || "https://api.sasi.io";
}

export async function sasiFetch<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const url = new URL(path, getSasiBaseUrl());
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SASI ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`);
  }

  return (await res.json()) as T;
}

export async function sasiPost<T>(
  path: string,
  token: string,
  body: unknown,
  init?: RequestInit,
): Promise<T> {
  return await sasiFetch<T>(path, token, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });
}

