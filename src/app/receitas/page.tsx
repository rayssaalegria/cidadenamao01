"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SasiMeResponse } from "@/lib/sasi";
import { QrCode, X } from "lucide-react";
import styles from "./page.module.css";

const defaultProfilePhoto = "/avatar-default.svg";

// Assets do Figma (referência visual do modal de Receita)
const imgRxPlaceholder = "https://www.figma.com/api/mcp/asset/b529bde2-667f-487c-9876-62a919c274eb";

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

type Receita = {
  id: number;
  created_at: string;
  profissional: string | null;
  crm: string | null;
  especialidade: string | null;
  image_url: string | null;
  status: string | null;
};

type Atestado = {
  id: number;
  created_at: string;
  profissional: string | null;
  crm: string | null;
  especialidade: string | null;
  image_url: string | null;
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

function fmtDateTimeBr(iso: string) {
  // ISO (ou timestamp) → dd/mm/yyyy hh:mm:ss (best-effort)
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(
    d.getSeconds(),
  )}`;
}

function downloadUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function isPdfUrl(url: string) {
  const u = String(url || "").trim().toLowerCase();
  return u.startsWith("data:application/pdf") || u.includes("application/pdf") || u.endsWith(".pdf");
}

export default function ReceitasPage() {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<SasiMeResponse | null>(null);
  const [dados, setDados] = useState<DadosUsuariosRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<"Receitas" | "Atestados">("Receitas");
  const [receitas, setReceitas] = useState<Receita[]>([]);
  const [loadingRx, setLoadingRx] = useState(false);
  const [atestados, setAtestados] = useState<Atestado[]>([]);
  const [loadingAt, setLoadingAt] = useState(false);

  const [rxOpen, setRxOpen] = useState(false);
  const [rxSelected, setRxSelected] = useState<Receita | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const [atOpen, setAtOpen] = useState(false);
  const [atSelected, setAtSelected] = useState<Atestado | null>(null);
  const closeAtBtnRef = useRef<HTMLButtonElement | null>(null);

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
      if (!cpf || tab !== "Receitas") return;
      setLoadingRx(true);
      try {
        const res = await fetch(`/api/receitas?cpf=${encodeURIComponent(cpf)}`, { cache: "no-store" });
        const json = (await res.json()) as { data?: Receita[]; error?: string };
        if (!res.ok) throw new Error(json.error || "Falha ao carregar receitas");
        if (!cancelled) setReceitas(json.data || []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar receitas");
      } finally {
        if (!cancelled) setLoadingRx(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [cpf, tab]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!cpf || tab !== "Atestados") return;
      setLoadingAt(true);
      try {
        const res = await fetch(`/api/atestados?cpf=${encodeURIComponent(cpf)}`, { cache: "no-store" });
        const json = (await res.json()) as { data?: Atestado[]; error?: string };
        if (!res.ok) throw new Error(json.error || "Falha ao carregar atestados");
        if (!cancelled) setAtestados(json.data || []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar atestados");
      } finally {
        if (!cancelled) setLoadingAt(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [cpf, tab]);

  useEffect(() => {
    if (!rxOpen) return;
    closeBtnRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setRxOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [rxOpen]);

  useEffect(() => {
    if (!atOpen) return;
    closeAtBtnRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setAtOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [atOpen]);

  const rxImageUrl = rxSelected?.image_url || imgRxPlaceholder;
  const atImageUrl = atSelected?.image_url || imgRxPlaceholder;

  return (
    <div className={styles.page}>
      {error ? <div className={styles.content}><div className={styles.empty}>{error}</div></div> : null}

      <main className={styles.content} aria-busy={loading || loadingRx || loadingAt}>
        <section className={`${styles.card} ${styles.cardPad24Y}`}>
          <div className={styles.cardInner}>
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
        </section>

        <section className={styles.tabsBar} role="tablist" aria-label="Documentos de saúde">
          <button
            type="button"
            className={[styles.tabBtn, tab === "Receitas" ? styles.tabBtnActive : ""].filter(Boolean).join(" ")}
            onClick={() => setTab("Receitas")}
            role="tab"
            aria-selected={tab === "Receitas"}
          >
            Receitas
          </button>
          <button
            type="button"
            className={[styles.tabBtn, tab === "Atestados" ? styles.tabBtnActive : ""].filter(Boolean).join(" ")}
            onClick={() => setTab("Atestados")}
            role="tab"
            aria-selected={tab === "Atestados"}
          >
            Atestados
          </button>
        </section>

        {tab === "Receitas" ? (
          <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {loadingRx ? (
              <div className={styles.empty}>Carregando…</div>
            ) : receitas.length ? (
              receitas.map((r) => (
                <div key={r.id} className={styles.rxCard}>
                  <div className={styles.rxTopRow}>
                    <div className={styles.rxTopLabel}>Data</div>
                    <div className={styles.rxTopValue}>{fmtDateTimeBr(r.created_at)}</div>
                  </div>

                  <div className={styles.rxMeta}>
                    <div className={styles.fieldRow}>
                      <div className={styles.label10}>Profissional</div>
                      <div className={styles.fieldValue}>{r.profissional || "-"}</div>
                    </div>
                    <div className={styles.fieldRow}>
                      <div className={styles.label10}>CRM</div>
                      <div className={styles.fieldValue}>{r.crm || "-"}</div>
                    </div>
                    <div className={styles.fieldRow}>
                      <div className={styles.label10}>Especialidade</div>
                      <div className={styles.fieldValue}>{r.especialidade || "-"}</div>
                    </div>
                  </div>

                  <div style={{ height: 16 }} />
                  <button
                    className={styles.rxButton}
                    type="button"
                    onClick={() => {
                      setRxSelected(r);
                      setRxOpen(true);
                    }}
                  >
                    Ver Receita
                  </button>
                </div>
              ))
            ) : (
              <div className={styles.empty}>Nenhuma receita encontrada.</div>
            )}
          </section>
        ) : (
          <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {loadingAt ? (
              <div className={styles.empty}>Carregando…</div>
            ) : atestados.length ? (
              atestados.map((a) => (
                <div key={a.id} className={styles.rxCard}>
                  <div className={styles.rxTopRow}>
                    <div className={styles.rxTopLabel}>Data</div>
                    <div className={styles.rxTopValue}>{fmtDateTimeBr(a.created_at)}</div>
                  </div>

                  <div className={styles.rxMeta}>
                    <div className={styles.fieldRow}>
                      <div className={styles.label10}>Profissional</div>
                      <div className={styles.fieldValue}>{a.profissional || "-"}</div>
                    </div>
                    <div className={styles.fieldRow}>
                      <div className={styles.label10}>CRM</div>
                      <div className={styles.fieldValue}>{a.crm || "-"}</div>
                    </div>
                    <div className={styles.fieldRow}>
                      <div className={styles.label10}>Especialidade</div>
                      <div className={styles.fieldValue}>{a.especialidade || "-"}</div>
                    </div>
                  </div>

                  <div style={{ height: 16 }} />
                  <button
                    className={styles.rxButton}
                    type="button"
                    onClick={() => {
                      setAtSelected(a);
                      setAtOpen(true);
                    }}
                  >
                    Ver Atestado
                  </button>
                </div>
              ))
            ) : (
              <div className={styles.empty}>Nenhum atestado encontrado.</div>
            )}
          </section>
        )}
      </main>

      {rxOpen ? (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Receita" onClick={() => setRxOpen(false)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogHeader}>
              <div className={styles.dialogTitle}>Receita</div>
              <button ref={closeBtnRef} className={styles.iconBtn} type="button" aria-label="Fechar" onClick={() => setRxOpen(false)}>
                ×
              </button>
            </div>

            <div className={styles.dialogContent}>
              {isPdfUrl(rxImageUrl) ? (
                <iframe className={styles.pdfFrame} src={rxImageUrl} title="Receita (PDF)" />
              ) : (
                <img className={styles.rxImage} src={rxImageUrl} alt="Imagem da receita" />
              )}
            </div>

            <div className={styles.dialogFooter}>
              <button className={styles.secondaryBtn} type="button" onClick={() => {}}>
                Renovar
              </button>
              <button
                className={styles.primaryBtn}
                type="button"
                onClick={() => {
                  downloadUrl(rxImageUrl, `receita-${rxSelected?.id ?? "arquivo"}.${isPdfUrl(rxImageUrl) ? "pdf" : "png"}`);
                }}
              >
                Baixar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {atOpen ? (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Atestado" onClick={() => setAtOpen(false)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogHeader}>
              <div className={styles.dialogTitle}>Atestado</div>
              <button ref={closeAtBtnRef} className={styles.iconBtn} type="button" aria-label="Fechar" onClick={() => setAtOpen(false)}>
                ×
              </button>
            </div>

            <div className={styles.dialogContent}>
              {isPdfUrl(atImageUrl) ? (
                <iframe className={styles.pdfFrame} src={atImageUrl} title="Atestado (PDF)" />
              ) : (
                <img className={styles.rxImage} src={atImageUrl} alt="Imagem do atestado" />
              )}
            </div>

            <div className={styles.dialogFooter}>
              <button className={styles.secondaryBtn} type="button" onClick={() => {}}>
                Renovar
              </button>
              <button
                className={styles.primaryBtn}
                type="button"
                onClick={() => {
                  downloadUrl(atImageUrl, `atestado-${atSelected?.id ?? "arquivo"}.${isPdfUrl(atImageUrl) ? "pdf" : "png"}`);
                }}
              >
                Baixar
              </button>
            </div>
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

