"use client";

import { useEffect, useMemo, useState } from "react";
import type { SasiMeResponse } from "@/lib/sasi";
import { QrCode, X } from "lucide-react";
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
  nome_completo?: string | null;
  especialidade_agendar: string | null;
  tipo?: string | null;
  data_consulta_date: string | null;
  horario_consulta_time: string | null;
  local_consulta: string | null;
  status: string | null;
};

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

export default function MinhasSolicitacoesPage() {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<SasiMeResponse | null>(null);
  const [dados, setDados] = useState<DadosUsuariosRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [items, setItems] = useState<AgendamentoRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [qrError, setQrError] = useState<string | null>(null);

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
      if (!cpf && !token) return;
      setLoadingList(true);
      try {
        const qs = new URLSearchParams();
        if (cpf) qs.set("cpf", cpf);
        const res = await fetch(`/api/agendamentos?${qs.toString()}`, {
          cache: "no-store",
          headers: token ? { "x-sasi-token": token } : undefined,
        });
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
  }, [cpf, token]);

  return (
    <div className={styles.page}>
      {error ? <div className={styles.error}>{error}</div> : null}

      <main className={styles.content} aria-busy={loading || loadingList}>
        <section className={`${styles.card} ${styles.cardPad24Y}`}>
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
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {loadingList ? (
            <div style={{ color: "#8f9bb3" }}>Carregando…</div>
          ) : items.length ? (
            items.map((c) => (
              <div key={c.id} className={`${styles.card} ${styles.apptCard}`}>
                <div className={styles.apptTitle}>{c.especialidade_agendar || "-"}</div>
                <div style={{ height: 16 }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div className={styles.fieldRow} style={{ padding: 0 }}>
                    <div className={styles.label10}>Tipo:</div>
                    <div className={styles.fieldValue}>{c.tipo === "exame" ? "Exame" : "Consulta"}</div>
                  </div>
                  <div className={styles.fieldRow} style={{ padding: 0 }}>
                    <div className={styles.label10}>Status:</div>
                    <div className={styles.fieldValue}>{c.status || "-"}</div>
                  </div>
                  <div className={styles.fieldRow} style={{ padding: 0 }}>
                    <div className={styles.label10}>Local:</div>
                    <div className={styles.fieldValue}>{c.local_consulta || "-"}</div>
                  </div>
                  <div className={styles.fieldRow} style={{ padding: 0 }}>
                    <div className={styles.label10}>Data:</div>
                    <div className={styles.fieldValue}>{c.data_consulta_date ? fmtDateBr(c.data_consulta_date) : "-"}</div>
                  </div>
                  <div className={styles.fieldRow} style={{ padding: 0 }}>
                    <div className={styles.label10}>Horário:</div>
                    <div className={styles.fieldValue}>{c.horario_consulta_time?.slice(0, 5) || "-"}</div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div style={{ color: "#8f9bb3" }}>Nenhum agendamento/consulta encontrado.</div>
          )}
        </section>
      </main>

      {qrOpen ? (
        <div className={styles.qrOverlay} role="dialog" aria-modal="true" aria-label="QR Code" onClick={() => setQrOpen(false)}>
          <div className={styles.qrModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.qrHeader}>
              <div className={styles.qrTitle}>Seu QR Code</div>
              <button className={styles.qrCloseBtn} type="button" onClick={() => setQrOpen(false)} aria-label="Fechar">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className={styles.qrBox}>
              {qrStatus === "loading" ? (
                <div style={{ color: "#4b5563" }}>Gerando…</div>
              ) : qrStatus === "error" ? (
                <div style={{ color: "#b00020" }}>{qrError || "Falha ao gerar QR"}</div>
              ) : qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.qrImg} src={qrDataUrl} alt="QR Code" />
              ) : (
                <div style={{ color: "#4b5563" }}>QR indisponível</div>
              )}
            </div>

            <div className={styles.qrHint}>Aponte a câmera para compartilhar seus dados com segurança.</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

