"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SasiMeResponse } from "@/lib/sasi";
import { CheckSquare2, ChevronLeft, Inbox, Search, SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

const defaultProfilePhoto = "/avatar-default.svg";

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
    return url.searchParams.get("sasiToken") || url.searchParams.get("sasi-token") || url.searchParams.get("token") || "";
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
  draft_overrides: { rg?: string; sus?: string } | null;
  profile_photo: string | null;
};

type AgendamentoRow = {
  id: number;
  created_at: string;
  especialidade_agendar: string | null;
  tipo?: string | null;
  data_consulta_date: string | null;
  horario_consulta_time: string | null;
  local_consulta: string | null;
  status: string | null;
  exame?: { id: number; nome: string | null } | null;
};

type TabKey = "Em andamento" | "Concluídas";

function fmtShortDateTimeBr(iso: string) {
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return iso;
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  const hh = String(dt.getHours()).padStart(2, "0");
  const min = String(dt.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy}, ${hh}:${min}`;
}

function fmtShortRange(fromIso: string, toIso: string) {
  const [fy, fm, fd] = fromIso.split("-");
  const [ty, tm, td] = toIso.split("-");
  if (!fy || !fm || !fd || !ty || !tm || !td) return `${fromIso} – ${toIso}`;
  return `${fd}/${fm} – ${td}/${tm}`;
}

export default function MinhasSolicitacoesPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<SasiMeResponse | null>(null);
  const [dados, setDados] = useState<DadosUsuariosRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabKey>("Em andamento");
  const [items, setItems] = useState<AgendamentoRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [draftTipos, setDraftTipos] = useState<string[]>([]);

  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");
  const [appliedTipos, setAppliedTipos] = useState<string[]>([]);

  const sheetRef = useRef<HTMLDivElement | null>(null);

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
  const cpf = useMemo(() => (me?.profileProps?.cpf || dados?.cpf || "").trim(), [me, dados]);
  const rg = useMemo(() => (dados?.draft_overrides?.rg || me?.profileProps?.documento_rg || "").trim(), [dados, me]);
  const sus = useMemo(() => (dados?.draft_overrides?.sus || me?.profileProps?.documento_sus || "").trim(), [dados, me]);
  const photo = useMemo(() => dados?.profile_photo || defaultProfilePhoto, [dados]);

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
        const meRes = await fetch("/api/sasi/me", { headers: { "x-sasi-token": token }, cache: "no-store" });
        if (!meRes.ok) throw new Error(await meRes.text());
        const meJson = (await meRes.json()) as SasiMeResponse;
        if (cancelled) return;
        setMe(meJson);

        const cpfFromMe = (meJson.profileProps?.cpf || "").trim();
        if (cpfFromMe) {
          const duRes = await fetch(`/api/dados-usuarios?cpf=${encodeURIComponent(cpfFromMe)}`, { cache: "no-store" });
          if (duRes.ok) {
            const duJson = (await duRes.json()) as { data: DadosUsuariosRow };
            if (!cancelled) setDados(duJson.data);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar dados");
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
      const cpf = (me?.profileProps?.cpf || dados?.cpf || "").trim();
      if (!cpf) return;
      setLoadingList(true);
      try {
        const qs = new URLSearchParams();
        qs.set("cpf", cpf);
        // Status no banco de agendamentos: "Agendada" | "Concluída" | "Cancelada"
        if (tab === "Concluídas") qs.set("status", "Concluída");
        else qs.set("status", "Agendada");
        const res = await fetch(`/api/agendamentos?${qs.toString()}`, { cache: "no-store" });
        const json = (await res.json()) as { data?: AgendamentoRow[]; error?: string };
        if (!res.ok) throw new Error(json.error || "Falha ao carregar agendamentos");
        if (!cancelled) setItems(json.data || []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar agendamentos");
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [me, dados, tab]);

  useEffect(() => {
    if (!filterOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setFilterOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filterOpen]);

  useEffect(() => {
    if (!filterOpen) return;
    function onDown(e: MouseEvent | TouchEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (sheetRef.current && sheetRef.current.contains(t)) return;
      setFilterOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [filterOpen]);

  const hasAppliedFilters = Boolean((appliedFrom && appliedTo) || appliedTipos.length);
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (q) {
        const title = String(it.exame?.nome || it.especialidade_agendar || "");
        const hay = `${title}\n${it.local_consulta || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (appliedTipos.length) {
        const tipo = String(it.tipo || "especialidade").trim();
        if (!tipo) return false;
        const ok = appliedTipos.some((t) => t.toLowerCase() === tipo.toLowerCase());
        if (!ok) return false;
      }
      if (appliedFrom && appliedTo) {
        const created = new Date(it.data_consulta_date || it.created_at).getTime();
        const from = new Date(appliedFrom + "T00:00:00").getTime();
        const to = new Date(appliedTo + "T23:59:59").getTime();
        if (Number.isFinite(created) && (created < from || created > to)) return false;
      }
      return true;
    });
  }, [items, query, appliedFrom, appliedTo, appliedTipos]);

  function tipoLabel(tipo: string) {
    const t = tipo.trim().toLowerCase();
    if (t === "exame") return "Exame";
    // Compat: consulta é "especialidade" (ou nulo em legados)
    if (!t || t === "especialidade") return "Consulta";
    return tipo.trim() || "Consulta";
  }

  function tipoClass(tipo: string) {
    const t = tipo.trim().toLowerCase();
    if (t === "exame") return styles.badgeTipoSugestao;
    if (!t || t === "especialidade") return styles.badgeTipoSolicitacao;
    return styles.badgeTipoNeutra;
  }

  function toggleDraftTipo(next: string) {
    setDraftTipos((prev) => {
      const has = prev.some((x) => x.toLowerCase() === next.toLowerCase());
      if (has) return prev.filter((x) => x.toLowerCase() !== next.toLowerCase());
      return [...prev, next];
    });
  }

  function openFilter() {
    setDraftFrom(appliedFrom);
    setDraftTo(appliedTo);
    setDraftTipos(appliedTipos);
    setFilterOpen(true);
  }

  function applyFilters() {
    setAppliedFrom(draftFrom);
    setAppliedTo(draftTo);
    setAppliedTipos(draftTipos);
    setFilterOpen(false);
  }

  function clearFilters() {
    setDraftFrom("");
    setDraftTo("");
    setDraftTipos([]);
  }

  return (
    <div className={styles.page}>
      {error ? <div className={styles.error}>{error}</div> : null}

      <main className={styles.content} aria-busy={loading || loadingList}>
        <header className={styles.header}>
          <button className={styles.backButton} type="button" onClick={() => router.back()} aria-label="Voltar">
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <div className={styles.headerTitle}>Minhas solicitações</div>
        </header>

        <div className={styles.segmented} role="tablist" aria-label="Status das solicitações">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "Em andamento"}
            className={[styles.segment, tab === "Em andamento" ? styles.segmentActive : ""].filter(Boolean).join(" ")}
            onClick={() => setTab("Em andamento")}
          >
            <Inbox size={18} aria-hidden="true" />
            <span>Em andamento</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "Concluídas"}
            className={[styles.segment, tab === "Concluídas" ? styles.segmentActive : ""].filter(Boolean).join(" ")}
            onClick={() => setTab("Concluídas")}
          >
            <CheckSquare2 size={18} aria-hidden="true" />
            <span>Concluídas</span>
          </button>
        </div>

        <div className={styles.searchRow}>
          <label className={styles.searchBox}>
            <Search size={16} aria-hidden="true" />
            <input
              className={styles.searchInput}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar"
              aria-label="Pesquisar"
            />
          </label>
          <button
            type="button"
            className={[styles.filterButton, hasAppliedFilters ? styles.filterButtonActive : ""].filter(Boolean).join(" ")}
            onClick={openFilter}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span>Filtrar</span>
          </button>
        </div>

        {hasAppliedFilters ? (
          <div className={styles.chipsRow} aria-label="Filtros aplicados">
            {appliedTipos.map((t) => (
              <button
                key={t}
                type="button"
                className={[styles.appliedChip, tipoClass(t)].join(" ")}
                onClick={() => setAppliedTipos((prev) => prev.filter((x) => x.toLowerCase() !== t.toLowerCase()))}
              >
                <span>{tipoLabel(t)}</span>
                <X size={14} aria-hidden="true" />
              </button>
            ))}
            {appliedFrom && appliedTo ? (
              <button type="button" className={[styles.appliedChip, styles.appliedChipDate].join(" ")} onClick={openFilter}>
                <span>{fmtShortRange(appliedFrom, appliedTo)}</span>
                <X size={14} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}

        <section className={styles.list} aria-label="Lista de consultas e exames">
          {loadingList ? (
            <div className={styles.muted}>Carregando…</div>
          ) : filteredItems.length ? (
            filteredItems.map((it) => (
              <article key={it.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <div className={styles.cardTitle}>{it.exame?.nome || it.especialidade_agendar || "-"}</div>
                  <div className={[styles.badgeTipo, tipoClass(it.tipo || "")].join(" ")}>
                    {tipoLabel(it.tipo || "")}
                  </div>
                </div>
                <div className={styles.cardDesc}>{it.local_consulta || ""}</div>
                <div className={styles.cardBottom}>
                  <div className={styles.badgeStatus}>{tab}</div>
                  <div className={styles.cardDate}>
                    {it.data_consulta_date && it.horario_consulta_time
                      ? `${it.data_consulta_date.split("-").reverse().join("/")}, ${it.horario_consulta_time.slice(0, 5)}`
                      : fmtShortDateTimeBr(it.created_at)}
                  </div>
                </div>
              </article>
            ))
          ) : (
            <div className={styles.muted}>Nenhuma consulta/exame encontrado.</div>
          )}
        </section>
      </main>

      {filterOpen ? (
        <div className={styles.sheetOverlay} role="dialog" aria-modal="true" aria-label="Filtrar solicitações">
          <div className={styles.sheet} ref={sheetRef}>
            <div className={styles.sheetHandle} aria-hidden="true" />
            <div className={styles.sheetHeader}>
              <div className={styles.sheetTitle}>Filtrar solicitações</div>
              <button className={styles.sheetClose} type="button" onClick={() => setFilterOpen(false)} aria-label="Fechar">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className={styles.sheetDivider} />

            <div className={styles.sheetSection}>
              <div className={styles.sectionTitle}>Data</div>
              <div className={styles.dateRow}>
                <label className={styles.dateField}>
                  <div className={styles.dateLabel}>De</div>
                  <input className={styles.dateInput} type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} />
                </label>
                <label className={styles.dateField}>
                  <div className={styles.dateLabel}>Até</div>
                  <input className={styles.dateInput} type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} />
                </label>
              </div>
            </div>

            <div className={styles.sheetDivider} />

            <div className={styles.sheetSection}>
              <div className={styles.sectionTitle}>Tipo</div>
              <div className={styles.tipoGrid}>
                {["especialidade", "exame"].map((t) => {
                  const selected = draftTipos.some((x) => x.toLowerCase() === t.toLowerCase());
                  return (
                    <button
                      key={t}
                      type="button"
                      className={[styles.tipoPill, selected ? styles.tipoPillSelected : ""].filter(Boolean).join(" ")}
                      onClick={() => toggleDraftTipo(t)}
                    >
                      {tipoLabel(t)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.sheetDivider} />

            <div className={styles.sheetActions}>
              <button type="button" className={styles.clearBtn} onClick={clearFilters}>
                Limpar filtros
              </button>
              <button type="button" className={styles.applyBtn} onClick={applyFilters} disabled={Boolean(draftFrom) !== Boolean(draftTo)}>
                <span>Aplicar</span>
                <SlidersHorizontal size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

