"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SasiMeResponse } from "@/lib/sasi";
import { QrCode, X } from "lucide-react";
import styles from "./page.module.css";

const ESPECIALIDADES = {
  placeholder: "Digite ou selecione a especialidade",
  allowSearch: true,
  options: [
    {
      label: "Não sei qual escolher",
      value: "clinica_geral",
      alias: ["geral", "dúvida", "não sei"],
      isDefaultRedirect: true,
    },
    { label: "Clínica Geral", value: "clinica_geral" },
    { label: "Medicina de Família", value: "medicina_familia" },
    { label: "Cardiologia", value: "cardiologia" },
    { label: "Angiologia / Vascular", value: "vascular" },
    { label: "Pneumologia", value: "pneumologia" },
    { label: "Gastroenterologia", value: "gastroenterologia" },
    { label: "Endocrinologia", value: "endocrinologia" },
    { label: "Nefrologia", value: "nefrologia" },
    { label: "Urologia", value: "urologia" },
    { label: "Neurologia", value: "neurologia" },
    { label: "Psiquiatria", value: "psiquiatria" },
    { label: "Dermatologia", value: "dermatologia" },
    { label: "Ortopedia e Traumatologia", value: "ortopedia" },
    { label: "Reumatologia", value: "reumatologia" },
    { label: "Oftalmologia", value: "oftalmologia" },
    { label: "Otorrinolaringologia", value: "otorrino" },
    { label: "Ginecologia", value: "ginecologia" },
    { label: "Obstetrícia", value: "obstetricia" },
    { label: "Pediatria", value: "pediatria" },
    { label: "Oncologia", value: "oncologia" },
    { label: "Infectologia", value: "infectologia" },
    { label: "Alergia / Imunologia", value: "alergia" },
    { label: "Geriatria", value: "geriatria" },
  ],
} as const;

type EspecialidadeOption = (typeof ESPECIALIDADES.options)[number];

const NOTIFY_SESSION_UUID_KEY = "agendamentos:notify-session-uuid:v1";

function getOrCreateNotifySessionUuid() {
  try {
    const existing = localStorage.getItem(NOTIFY_SESSION_UUID_KEY) || "";
    if (existing) return existing;
    const uuid = globalThis.crypto?.randomUUID?.() || String(Date.now());
    localStorage.setItem(NOTIFY_SESSION_UUID_KEY, uuid);
    return uuid;
  } catch {
    return globalThis.crypto?.randomUUID?.() || String(Date.now());
  }
}

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function getTokenFromStorage() {
  try {
    return localStorage.getItem("id_sasi") || localStorage.getItem("sasi-token") || "";
  } catch {
    return "";
  }
}

function getTokenFromUrl() {
  try {
    const url = new URL(window.location.href);
    return (
      url.searchParams.get("sasiToken") ||
      url.searchParams.get("sasi-token") ||
      url.searchParams.get("token") ||
      ""
    );
  } catch {
    return "";
  }
}

function getProfileIdFromUrl() {
  try {
    const url = new URL(window.location.href);
    return (url.searchParams.get("profile_id") || url.searchParams.get("profileId") || "").trim();
  } catch {
    return "";
  }
}

function persistToken(token: string) {
  try {
    localStorage.setItem("id_sasi", token);
    localStorage.setItem("sasi-token", token);
  } catch {
    // ignore
  }
}

function removeTokenFromUrl() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("sasiToken");
    url.searchParams.delete("sasi-token");
    url.searchParams.delete("token");
    window.history.replaceState({}, "", url.toString());
  } catch {
    // ignore
  }
}

function extractTokenFromMessage(data: unknown): string {
  if (!data) return "";
  if (typeof data === "string") {
    const trimmed = data.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        return extractTokenFromMessage(JSON.parse(trimmed));
      } catch {
        return "";
      }
    }
    return trimmed;
  }
  if (typeof data === "object") {
    const anyData = data as Record<string, unknown>;
    const type = typeof anyData.type === "string" ? anyData.type : "";
    const token =
      (typeof anyData.token === "string" && anyData.token) ||
      (typeof anyData.sasiToken === "string" && anyData.sasiToken) ||
      (typeof anyData["sasi-token"] === "string" && (anyData["sasi-token"] as string)) ||
      "";
    if (token && (type === "SASI_TOKEN" || type === "sasi-token" || !type)) return token;
  }
  return "";
}

function requestTokenFromHost() {
  try {
    const rn = (window as unknown as { ReactNativeWebView?: { postMessage: (msg: string) => void } })
      .ReactNativeWebView;
    rn?.postMessage?.(JSON.stringify({ type: "REQUEST_SASI_TOKEN" }));
  } catch {
    // ignore
  }
  try {
    window.parent?.postMessage?.({ type: "REQUEST_SASI_TOKEN" }, "*");
  } catch {
    // ignore
  }
}

type DadosUsuariosRow = {
  cpf: string;
  nome: string;
  draft_overrides: {
    rg?: string;
    sus?: string;
  } | null;
  profile_photo: string | null;
};

type AgendamentoRow = {
  id: number;
  created_at: string;
  nome_completo: string | null;
  cpf: number | null;
  carteira_sus: number | null;
  especialidade_agendar: string | null;
  data_consulta_date: string | null;
  horario_consulta_time: string | null;
  local_consulta: string | null;
  status: string | null;
  qr_code: string | null;
};

type FlowStep = "lista" | "novo_tipo" | "novo_data" | "novo_horario";

type DisponSlot = { id: number; time: string; localId: number | null; local: string };

function fmtCpf(cpf: string) {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function fmtSus(sus: string) {
  const d = sus.replace(/\D/g, "");
  if (d.length < 10) return sus;
  return d.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function fmtDateBr(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function fmtLongDateBr(iso: string) {
  const [y, m, d] = iso.split("-");
  const mm = Number(m);
  const dd = Number(d);
  const yy = Number(y);
  if (!Number.isFinite(mm) || !Number.isFinite(dd) || !Number.isFinite(yy)) return iso;
  const months = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  return `${dd} de ${months[mm - 1] || m} de ${yy}`;
}

export default function NovoAgendamentoPage() {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<SasiMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dados, setDados] = useState<DadosUsuariosRow | null>(null);

  const [step, setStep] = useState<FlowStep>("lista");
  const [tab, setTab] = useState<"Agendada" | "Concluída">("Agendada");
  const [agendamentos, setAgendamentos] = useState<AgendamentoRow[]>([]);
  const [loadingAg, setLoadingAg] = useState(false);

  const [especialidadeValue, setEspecialidadeValue] = useState<string>("");
  const [especialidadeLabel, setEspecialidadeLabel] = useState<string>("");

  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedHorario, setSelectedHorario] = useState<string>("");
  const [selectedLocalId, setSelectedLocalId] = useState<number | null>(null);
  const [selectedLocal, setSelectedLocal] = useState<string>("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [qrError, setQrError] = useState<string | null>(null);

  const profileIdFromUrl = useMemo(() => getProfileIdFromUrl(), []);

  // combobox state
  const [comboOpen, setComboOpen] = useState(false);
  const comboWrapRef = useRef<HTMLDivElement | null>(null);

  const especialidadeQuery = especialidadeLabel;
  const filteredOptions = useMemo(() => {
    const q = norm(especialidadeQuery);
    const all = ESPECIALIDADES.options;
    if (!ESPECIALIDADES.allowSearch || !q) return all;
    return all.filter((opt) => {
      const hay = [opt.label, opt.value, ...(("alias" in opt && Array.isArray(opt.alias) ? opt.alias : []) as string[])]
        .filter(Boolean)
        .map(norm);
      return hay.some((h) => h.includes(q));
    });
  }, [especialidadeQuery]);

  function pickEspecialidade(opt: EspecialidadeOption) {
    setEspecialidadeValue(opt.value);
    setEspecialidadeLabel(opt.label);
    setComboOpen(false);

    // reset do restante do fluxo
    setSelectedDate("");
    setSelectedHorario("");
    setSelectedLocalId(null);
    setSelectedLocal("");
  }

  useEffect(() => {
    function onDocClick(ev: MouseEvent) {
      const el = ev.target as Node | null;
      if (!el) return;
      if (comboWrapRef.current && !comboWrapRef.current.contains(el)) setComboOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    const urlToken = getTokenFromUrl();
    if (urlToken) {
      persistToken(urlToken);
      removeTokenFromUrl();
    }
    setTimeout(() => setToken(urlToken || getTokenFromStorage()), 0);
  }, []);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const t = extractTokenFromMessage((ev as unknown as { data?: unknown }).data);
      if (!t) return;
      persistToken(t);
      setToken(t);
    }
    window.addEventListener("message", onMessage);
    document.addEventListener("message" as never, onMessage as never);
    if (!getTokenFromStorage() && !getTokenFromUrl()) requestTokenFromHost();
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("message" as never, onMessage as never);
    };
  }, []);

  const fullName = useMemo(() => me?.profileProps?.name || me?.name || dados?.nome || "", [me, dados]);
  const cpf = useMemo(() => me?.profileProps?.cpf || dados?.cpf || "", [me, dados]);
  const rg = useMemo(() => (dados?.draft_overrides?.rg || me?.profileProps?.documento_rg || "").trim(), [dados, me]);
  const sus = useMemo(
    () => (dados?.draft_overrides?.sus || me?.profileProps?.documento_sus || "").trim(),
    [dados, me],
  );
  const photo = useMemo(() => dados?.profile_photo || "/avatar-default.svg", [dados]);

  const qrPayload = useMemo(() => {
    if (!cpf || !fullName) return "";
    return JSON.stringify({
      cpf,
      nome: fullName,
      carteiraSus: sus || null,
      qrCode: me?.customProps?.code || null,
    });
  }, [cpf, fullName, sus, me]);

  useEffect(() => {
    if (!qrOpen) return;

    let cancelled = false;
    async function run() {
      if (!qrPayload) {
        setQrStatus("error");
        setQrError(!cpf ? "CPF não encontrado" : "Nome não encontrado");
        setQrDataUrl(null);
        return;
      }
      try {
        setQrStatus("loading");
        setQrError(null);
        const mod = await import("qrcode");
        const QRCode = ("default" in mod ? (mod.default as typeof mod) : mod) as unknown as {
          toDataURL: (
            text: string,
            options?: { width?: number; margin?: number; errorCorrectionLevel?: "L" | "M" | "Q" | "H" },
          ) => Promise<string>;
        };
        const url = await QRCode.toDataURL(qrPayload, { width: 260, margin: 1, errorCorrectionLevel: "M" });
        if (!cancelled) {
          setQrDataUrl(url);
          setQrStatus("ready");
        }
      } catch (e) {
        if (!cancelled) {
          setQrDataUrl(null);
          setQrStatus("error");
          setQrError(e instanceof Error ? e.message : "Falha ao gerar QR");
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [qrOpen, qrPayload, cpf]);

  useEffect(() => {
    if (!qrOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setQrOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [qrOpen]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      setMe(null);
      setDados(null);

      if (token === null) {
        setLoading(false);
        return;
      }

      if (!token) {
        setLoading(false);
        setError("Não encontrei `id_sasi` (token).");
        return;
      }

      try {
        const meRes = await fetch("/api/sasi/me", {
          headers: { "x-sasi-token": token },
          cache: "no-store",
        });
        if (!meRes.ok) throw new Error(await meRes.text());
        const meJson = (await meRes.json()) as SasiMeResponse;
        if (cancelled) return;
        setMe(meJson);

        const cpfFromMe = (meJson.profileProps?.cpf || "").trim();
        if (cpfFromMe) {
          const duRes = await fetch(`/api/dados-usuarios?cpf=${encodeURIComponent(cpfFromMe)}`, {
            cache: "no-store",
          });
          if (duRes.ok) {
            const duJson = (await duRes.json()) as { data: DadosUsuariosRow };
            if (!cancelled) setDados(duJson.data);
          }
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Erro ao carregar dados");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!cpf) return;
      setLoadingAg(true);
      try {
        const res = await fetch(
          `/api/agendamentos?cpf=${encodeURIComponent(cpf)}&status=${encodeURIComponent(tab)}&tipo=especialidade`,
          { cache: "no-store" },
        );
        const json = (await res.json()) as { data?: AgendamentoRow[]; error?: string };
        if (!res.ok) throw new Error(json.error || "Falha ao carregar agendamentos");
        if (!cancelled) setAgendamentos(json.data || []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar agendamentos");
      } finally {
        if (!cancelled) setLoadingAg(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [cpf, tab]);

  const [availableDates, setAvailableDates] = useState<Set<string>>(() => new Set());
  const [slots, setSlots] = useState<DisponSlot[]>([]);
  const [loadingDispon, setLoadingDispon] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!especialidadeValue) {
        setAvailableDates(new Set());
        setSlots([]);
        return;
      }
      setLoadingDispon(true);
      try {
        const res = await fetch(
          `/api/especialidades/disponibilidade/datas?especialidade=${encodeURIComponent(especialidadeValue)}`,
          { cache: "no-store" },
        );
        const json = (await res.json()) as { dates?: string[]; error?: string };
        if (!res.ok) throw new Error(json.error || "Falha ao carregar datas");
        if (!cancelled) setAvailableDates(new Set((json.dates || []).filter(Boolean)));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar datas");
      } finally {
        if (!cancelled) setLoadingDispon(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [especialidadeValue]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!especialidadeValue || !selectedDate) {
        setSlots([]);
        return;
      }
      setLoadingDispon(true);
      try {
        const res = await fetch(
          `/api/especialidades/disponibilidade/slots?especialidade=${encodeURIComponent(especialidadeValue)}&date=${encodeURIComponent(
            selectedDate,
          )}`,
          { cache: "no-store" },
        );
        const json = (await res.json()) as { slots?: DisponSlot[]; error?: string };
        if (!res.ok) throw new Error(json.error || "Falha ao carregar horários");
        if (!cancelled) setSlots(json.slots || []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar horários");
      } finally {
        if (!cancelled) setLoadingDispon(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [especialidadeValue, selectedDate]);

  const calendar = useMemo(() => {
    const base = selectedDate ? new Date(selectedDate + "T00:00:00") : new Date();
    const year = base.getFullYear();
    const month = base.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDow = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const cells: Array<{ iso: string; label: string; muted: boolean }> = [];
    const pad = (n: number) => String(n).padStart(2, "0");
    const isoFor = (yy: number, mm: number, dd: number) => `${yy}-${pad(mm)}-${pad(dd)}`;

    for (let i = 0; i < 42; i++) {
      const dayIndex = i - startDow + 1;
      if (dayIndex < 1) {
        const dd = prevMonthDays + dayIndex;
        const prev = new Date(year, month - 1, dd);
        cells.push({ iso: isoFor(prev.getFullYear(), prev.getMonth() + 1, dd), label: String(dd), muted: true });
      } else if (dayIndex > daysInMonth) {
        const dd = dayIndex - daysInMonth;
        const next = new Date(year, month + 1, dd);
        cells.push({ iso: isoFor(next.getFullYear(), next.getMonth() + 1, dd), label: String(dd), muted: true });
      } else {
        cells.push({ iso: isoFor(year, month + 1, dayIndex), label: String(dayIndex), muted: false });
      }
    }

    const monthName = [
      "Janeiro",
      "Fevereiro",
      "Março",
      "Abril",
      "Maio",
      "Junho",
      "Julho",
      "Agosto",
      "Setembro",
      "Outubro",
      "Novembro",
      "Dezembro",
    ][month];

    return { year, month, monthName, cells };
  }, [selectedDate]);

  function startNew() {
    setError(null);
    setEspecialidadeValue("");
    setEspecialidadeLabel("");
    setSelectedDate("");
    setSelectedHorario("");
    setSelectedLocalId(null);
    setSelectedLocal("");
    setSheetOpen(false);
    setStep("novo_tipo");
  }

  function back() {
    if (sheetOpen) {
      setSheetOpen(false);
      return;
    }
    if (step === "novo_horario") setStep("novo_data");
    else if (step === "novo_data") setStep("novo_tipo");
    else setStep("lista");
  }

  async function confirmAgendamento() {
    if (!cpf || !fullName || !especialidadeValue || !selectedDate || !selectedHorario || !selectedLocal) return;
    setSaving(true);
    try {
      const res = await fetch("/api/agendamentos", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sasi-token": token,
          "x-sasi-profile-id": profileIdFromUrl || me?.id || "",
        },
        body: JSON.stringify({
          cpf,
          nome: fullName,
          carteiraSus: sus || null,
          especialidade: selectedEspecialidadeText || especialidadeValue,
          especialidadeValue,
          tipo: "especialidade",
          localId: selectedLocalId,
          dataConsulta: selectedDate,
          horarioConsulta: selectedHorario,
          localConsulta: selectedLocal,
          qrCode: me?.customProps?.code || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; row?: AgendamentoRow };
      if (!res.ok) throw new Error(json.error || "Falha ao confirmar agendamento");

      // Monitoramento SASI: novo-agendamento -> SASI Mobile Messages (ChannelId 27328)
      const notifyTest = (process.env.NEXT_PUBLIC_SASI_NOTIFY_TEST || "").trim().toLowerCase() === "true";
      const profileId = profileIdFromUrl || me?.id || "";
      if (profileId && json.row) {
        void fetch("/api/sasi/mobile-messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            profileId,
            message: {
              text: "",
              data: json.row,
              test: notifyTest,
              ChannelId: 27328,
              generatedAt: new Date().toISOString(),
              attachments: [],
              anonymous: false,
              dataComments: {},
              dataAttachments: {},
              dataAttachmentsFiles: {},
              attachmentsFiles: [],
              location: { lat: -21.7693476, lng: -43.3447036 },
              appVersionNumber: 7,
            },
          }),
        }).catch(() => {
          // ignore
        });
      }

      setSheetOpen(false);
      setStep("lista");
      setTab("Agendada");
      const listRes = await fetch(`/api/agendamentos?cpf=${encodeURIComponent(cpf)}&status=Agendada&tipo=especialidade`, {
        cache: "no-store",
      });
      const listJson = (await listRes.json()) as { data?: AgendamentoRow[] };
      setAgendamentos(listJson.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao confirmar agendamento");
    } finally {
      setSaving(false);
    }
  }

  const selectedEspecialidadeText = especialidadeLabel || ESPECIALIDADES.options.find((o) => o.value === especialidadeValue)?.label || "";
  const [cancelAgOpen, setCancelAgOpen] = useState(false);
  const [cancelAgId, setCancelAgId] = useState<number | null>(null);

  async function cancelAgendamento(id: number) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/agendamentos", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status: "Cancelada" }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error || "Falha ao cancelar agendamento");
      setCancelAgOpen(false);
      setCancelAgId(null);
      const listRes = await fetch(
        `/api/agendamentos?cpf=${encodeURIComponent(cpf)}&status=${encodeURIComponent(tab)}&tipo=especialidade`,
        { cache: "no-store" },
      );
      const listJson = (await listRes.json()) as { data?: AgendamentoRow[] };
      setAgendamentos(listJson.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao cancelar agendamento");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.content} aria-busy={loading || loadingAg || saving}>
        {step !== "lista" ? (
          <div className={styles.headerRow}>
            <button className={styles.backButton} type="button" onClick={back} aria-label="Voltar">
              ←
            </button>
            <div className={styles.title14}>Novo Agendamento</div>
            <div style={{ width: 24 }} aria-hidden="true" />
          </div>
        ) : null}

        {cancelAgOpen && cancelAgId ? (
          <div className={styles.sheetOverlay} role="dialog" aria-modal="true" aria-label="Confirmar cancelamento">
            <div className={styles.sheet}>
              <div className={styles.sheetTitle}>Cancelar agendamento?</div>
              <div style={{ height: 8 }} />
              <div className={styles.muted}>Você tem certeza que deseja cancelar este agendamento?</div>
              <div style={{ height: 16 }} />
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button className={styles.secondaryButton} type="button" onClick={() => setCancelAgOpen(false)} disabled={saving}>
                  Voltar
                </button>
                <button className={styles.dangerButton} type="button" onClick={() => void cancelAgendamento(cancelAgId)} disabled={saving}>
                  Sim, cancelar
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {step === "novo_tipo" ? (
          <>
            <div className={`${styles.card} ${styles.cardPad24Y}`}>
              <div className={styles.userRow}>
                <div className={styles.avatar}>
                  <img className={styles.avatarImg} src={photo} alt="" />
                </div>
                <div className={styles.userMeta}>
                  <div className={styles.label10}>Nome Completo:</div>
                  <div className={styles.value12}>{loading ? "Carregando..." : fullName || "-"}</div>
                </div>
                <button className={styles.qrButton} type="button" aria-label="Ver QR Code" onClick={() => setQrOpen(true)}>
                  <QrCode size={18} aria-hidden="true" />
                </button>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.label10}>RG:</div>
                <div className={styles.fieldValue}>{rg || "-"}</div>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.label10}>CPF:</div>
                <div className={styles.fieldValue}>{cpf ? fmtCpf(cpf) : "-"}</div>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.label10}>Carteirinha do SUS:</div>
                <div className={styles.fieldValue}>{sus ? fmtSus(sus) : "-"}</div>
              </div>
            </div>

            <div className={`${styles.card} ${styles.cardPad24Y}`}>
              <div className={`${styles.cardInner24} ${styles.inputBlock}`}>
                <div className={styles.inputLabel}>Especialidade</div>

                <div className={styles.selectLike} ref={comboWrapRef}>
                  <input
                    className="ds-control ds-md"
                    value={especialidadeLabel}
                    placeholder={ESPECIALIDADES.placeholder}
                    onChange={(e) => {
                      setEspecialidadeLabel(e.target.value);
                      setEspecialidadeValue("");
                      setComboOpen(true);
                    }}
                    onFocus={() => setComboOpen(true)}
                    aria-label="Digite ou selecione a especialidade"
                  />
                  <div className={styles.chevron} aria-hidden="true">
                    ⌄
                  </div>

                  {comboOpen ? (
                    <div className={styles.dropdown} role="listbox" aria-label="Lista de especialidades">
                      {filteredOptions.length ? (
                        filteredOptions.map((opt) => {
                          const isDefault = "isDefaultRedirect" in opt && Boolean((opt as any).isDefaultRedirect);
                          return (
                            <button
                              key={opt.label + ":" + opt.value}
                              type="button"
                              className={[styles.dropdownItem, isDefault ? styles.dropdownItemMuted : ""].filter(Boolean).join(" ")}
                              onClick={() => pickEspecialidade(opt)}
                            >
                              {opt.label}
                            </button>
                          );
                        })
                      ) : (
                        <div className={[styles.dropdownItem, styles.dropdownItemMuted].join(" ")}>Nenhuma opção encontrada.</div>
                      )}
                    </div>
                  ) : null}
                </div>

                <button
                  className={styles.primaryButton}
                  type="button"
                  disabled={!especialidadeValue}
                  onClick={() => {
                    const defaultOpt = ESPECIALIDADES.options.find((o) => "isDefaultRedirect" in o && (o as any).isDefaultRedirect);
                    if (!especialidadeValue && defaultOpt) pickEspecialidade(defaultOpt);
                    setStep("novo_data");
                  }}
                >
                  Continuar
                </button>
              </div>
            </div>
          </>
        ) : null}

        {step === "novo_data" ? (
          <>
            <div className={`${styles.card} ${styles.cardPad24Y}`}>
              <div className={styles.cardInner24}>
                <div className={styles.label10}>Especialidade</div>
                <div className={styles.value12}>{selectedEspecialidadeText || "-"}</div>
              </div>
            </div>

            <div className={`${styles.card} ${styles.cardPad16}`}>
              <div className={styles.calendarTitle}>Selecione uma data</div>
              <div className={styles.calendarHeader}>
                <button
                  type="button"
                  className={styles.navBtn}
                  aria-label="Mês anterior"
                  onClick={() => {
                    const base = selectedDate ? new Date(selectedDate + "T00:00:00") : new Date();
                    const prev = new Date(base.getFullYear(), base.getMonth() - 1, 1);
                    const y = prev.getFullYear();
                    const m = String(prev.getMonth() + 1).padStart(2, "0");
                    setSelectedDate(`${y}-${m}-01`);
                  }}
                >
                  ‹
                </button>
                <div className={styles.monthBox}>
                  <div className={styles.monthName}>{calendar.monthName}</div>
                  <div className={styles.year}>{calendar.year}</div>
                </div>
                <button
                  type="button"
                  className={styles.navBtn}
                  aria-label="Próximo mês"
                  onClick={() => {
                    const base = selectedDate ? new Date(selectedDate + "T00:00:00") : new Date();
                    const next = new Date(base.getFullYear(), base.getMonth() + 1, 1);
                    const y = next.getFullYear();
                    const m = String(next.getMonth() + 1).padStart(2, "0");
                    setSelectedDate(`${y}-${m}-01`);
                  }}
                >
                  ›
                </button>
              </div>

              <div className={styles.dowRow}>
                <div>Dom</div>
                <div>Seg</div>
                <div>Ter</div>
                <div>Qua</div>
                <div>Qui</div>
                <div>Sex</div>
                <div>Sáb</div>
              </div>

              <div className={styles.daysGrid} role="grid" aria-label="Calendário">
                {calendar.cells.map((c) => {
                  const isSelected = Boolean(selectedDate && c.iso === selectedDate);
                  const isAvail = availableDates.has(c.iso);
                  const cls = [styles.day, c.muted ? styles.dayMuted : "", isAvail ? styles.dayAvailable : "", isSelected ? styles.daySelected : ""]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <button
                      key={c.iso}
                      type="button"
                      className={cls}
                      disabled={!isAvail}
                      onClick={() => setSelectedDate(c.iso)}
                      aria-selected={isSelected}
                      role="gridcell"
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ height: 12 }} />
              <div className={styles.dividerLine} />
            </div>

            <button className={styles.primaryButton} type="button" disabled={!selectedDate || loadingDispon} onClick={() => setStep("novo_horario")}>
              Continuar
            </button>
          </>
        ) : null}

        {step === "novo_horario" ? (
          <>
            <div className={`${styles.card} ${styles.cardPad24Y}`}>
              <div className={styles.cardInner24}>
                <div className={styles.label10}>Especialidade</div>
                <div className={styles.value12}>{selectedEspecialidadeText || "-"}</div>
              </div>
            </div>

            <div className={`${styles.card} ${styles.cardPad16}`}>
              <div className={styles.rowBetween}>
                <div>
                  <div className={styles.slotsTitle}>Horário Disponível</div>
                  <div className={styles.slotsSub}>{selectedDate ? fmtLongDateBr(selectedDate) : "-"}</div>
                </div>
              </div>

              <div style={{ height: 16 }} />

              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {slots.length ? (
                  slots.map((s) => {
                    const checked = selectedHorario === s.time && selectedLocalId === s.localId;
                    return (
                      <div key={s.id} className={styles.slotRow}>
                        <button
                          type="button"
                          className={[styles.radioBtn, checked ? styles.radioBtnChecked : ""].filter(Boolean).join(" ")}
                          aria-label={`Selecionar ${s.time}`}
                          aria-checked={checked}
                          role="radio"
                          onClick={() => {
                            setSelectedHorario(s.time);
                            setSelectedLocalId(s.localId);
                            setSelectedLocal(s.local);
                          }}
                        />
                        <div className={styles.slotTime}>{s.time}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          <span className={styles.pin} aria-hidden="true">
                            ⌁
                          </span>
                          <div className={styles.slotPlace}>{s.local}</div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ color: "#8f9bb3" }}>Sem horários disponíveis.</div>
                )}
              </div>
            </div>

            <button className={styles.primaryButton} type="button" disabled={!selectedHorario} onClick={() => setSheetOpen(true)}>
              Continuar
            </button>
          </>
        ) : null}

        {step === "lista" ? (
          <>
            <div className={`${styles.card} ${styles.cardPad24Y}`}>
              <div className={styles.userRow}>
                <div className={styles.avatar}>
                  <img className={styles.avatarImg} src={photo} alt="" />
                </div>
                <div className={styles.userMeta}>
                  <div className={styles.label10}>Nome Completo:</div>
                  <div className={styles.value12}>{loading ? "Carregando..." : fullName || "-"}</div>
                </div>
                <button className={styles.qrButton} type="button" aria-label="Ver QR Code" onClick={() => setQrOpen(true)}>
                  <QrCode size={18} aria-hidden="true" />
                </button>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.label10}>RG:</div>
                <div className={styles.fieldValue}>{rg || "-"}</div>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.label10}>CPF:</div>
                <div className={styles.fieldValue}>{cpf ? fmtCpf(cpf) : "-"}</div>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.label10}>Carteirinha do SUS:</div>
                <div className={styles.fieldValue}>{sus ? fmtSus(sus) : "-"}</div>
              </div>
            </div>

            <div className={styles.tabsBar} role="tablist" aria-label="Agendamentos">
              <button
                type="button"
                className={[styles.tabBtn, tab === "Agendada" ? styles.tabBtnActive : ""].filter(Boolean).join(" ")}
                onClick={() => setTab("Agendada")}
                role="tab"
                aria-selected={tab === "Agendada"}
              >
                Agendadas
              </button>
              <button
                type="button"
                className={[styles.tabBtn, tab === "Concluída" ? styles.tabBtnActive : ""].filter(Boolean).join(" ")}
                onClick={() => setTab("Concluída")}
                role="tab"
                aria-selected={tab === "Concluída"}
              >
                Concluídas
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {loadingAg ? (
                <div style={{ color: "#8f9bb3" }}>Carregando…</div>
              ) : agendamentos.length ? (
                agendamentos.map((a) => (
                  <div key={a.id} className={`${styles.card} ${styles.apptCard}`}>
                    <div className={styles.apptTitle}>{a.especialidade_agendar || "-"}</div>
                    <div style={{ height: 16 }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      <div className={styles.fieldRow} style={{ padding: 0 }}>
                        <div className={styles.label10}>Local:</div>
                        <div className={styles.fieldValue}>{a.local_consulta || "-"}</div>
                      </div>
                      <div className={styles.fieldRow} style={{ padding: 0 }}>
                        <div className={styles.label10}>Data da Consulta:</div>
                        <div className={styles.fieldValue}>{a.data_consulta_date ? fmtDateBr(a.data_consulta_date) : "-"}</div>
                      </div>
                      <div className={styles.fieldRow} style={{ padding: 0 }}>
                        <div className={styles.label10}>Horário:</div>
                        <div className={styles.fieldValue}>{a.horario_consulta_time?.slice(0, 5) || "-"}</div>
                      </div>
                    </div>
                    {tab === "Agendada" ? (
                      <div style={{ height: 12 }} />
                    ) : null}
                    {tab === "Agendada" ? (
                      <button
                        className={styles.secondaryButton}
                        type="button"
                        onClick={() => {
                          setCancelAgId(a.id);
                          setCancelAgOpen(true);
                        }}
                      >
                        Cancelar agendamento
                      </button>
                    ) : null}
                  </div>
                ))
              ) : (
                <div style={{ color: "#8f9bb3" }}>Nenhum agendamento.</div>
              )}
            </div>

            <button className={styles.primaryButton} type="button" onClick={startNew}>
              Novo agendamento
            </button>
          </>
        ) : null}
      </div>

      {sheetOpen ? (
        <div className={styles.sheetOverlay} role="dialog" aria-modal="true" aria-label="Resumo do Agendamento" onClick={() => setSheetOpen(false)}>
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.sheetTitle}>Resumo do Agendamento</div>
            <div style={{ height: 24 }} />
            <div className={`${styles.card} ${styles.cardPad24Y}`}>
              <div className={styles.userRow}>
                <div className={styles.avatar}>
                  <img className={styles.avatarImg} src={photo} alt="" />
                </div>
                <div className={styles.userMeta}>
                  <div className={styles.label10}>Nome Completo:</div>
                  <div className={styles.value12}>{fullName || "-"}</div>
                </div>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.label10}>Carteirinha do SUS:</div>
                <div className={styles.fieldValue}>{sus ? fmtSus(sus) : "-"}</div>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.label10}>Especialidade:</div>
                <div className={styles.fieldValue}>{selectedEspecialidadeText || "-"}</div>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.label10}>Data da Consulta:</div>
                <div className={styles.fieldValue}>{selectedDate ? fmtDateBr(selectedDate) : "-"}</div>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.label10}>Horário:</div>
                <div className={styles.fieldValue}>{selectedHorario || "-"}</div>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.label10}>Local:</div>
                <div className={styles.fieldValue}>{selectedLocal || "-"}</div>
              </div>
            </div>

            <div style={{ height: 24 }} />

            <button className={styles.primaryButton} type="button" onClick={confirmAgendamento} disabled={saving}>
              {saving ? "Confirmando..." : "Confirmar Agendamento"}
            </button>
          </div>
        </div>
      ) : null}

      {qrOpen ? (
        <div className={styles.qrOverlay} role="dialog" aria-modal="true" aria-label="QR Code" onClick={() => setQrOpen(false)}>
          <div className={styles.qrModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.qrHeader}>
              <div className={styles.qrTitle}>QR Code</div>
              <button className={styles.qrCloseBtn} type="button" onClick={() => setQrOpen(false)} aria-label="Fechar">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className={styles.qrBox}>
              {qrStatus === "loading" ? (
                <div className={styles.qrHint}>Gerando…</div>
              ) : qrStatus === "error" ? (
                <div className={styles.qrHint}>{qrError || "Não foi possível gerar o QR Code."}</div>
              ) : qrDataUrl ? (
                <img className={styles.qrImg} src={qrDataUrl} alt="QR Code do usuário" />
              ) : (
                <div className={styles.qrHint}>Nenhum QR Code disponível.</div>
              )}
            </div>

            <div className={styles.qrHint}>Toque fora ou em “Fechar” para voltar.</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

