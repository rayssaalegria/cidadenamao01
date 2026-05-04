"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";
import type { SasiMeResponse } from "@/lib/sasi";

const defaultProfilePhoto = "/avatar-default.svg";
const imgImage1585 =
  "https://www.figma.com/api/mcp/asset/f1c34dd9-8fc5-43d7-94e0-bd66712f7bcc";
const imgVector =
  "https://www.figma.com/api/mcp/asset/bb94ae8c-fa9f-4909-9a97-0634d198f61e";

type EditableDraft = {
  dataNascimento: string;
  genero: string;
  email: string;
  phone: string;
  rg: string;
  sus: string;
  cep: string;
  bairro: string;
  rua: string;
  numero: string;
  complemento: string;
  uf: string;
  cidade: string;
  estadoCivil: string;
  escolaridade: string;
  profissao: string;
  renda: string;
};

const DRAFT_STORAGE_KEY = "meus-dados:overrides:v1";
const PHOTO_STORAGE_KEY = "meus-dados:photo:v1";
const NOTIFY_SESSION_UUID_KEY = "meus-dados:notify-session-uuid:v1";

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
    // compatibilidade (caso algum outro fluxo ainda leia a chave antiga)
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

type TokenMessage =
  | { type: "SASI_TOKEN"; token: string }
  | { type: "sasi-token"; token: string }
  | { sasiToken: string }
  | { "sasi-token": string }
  | string;

function extractTokenFromMessage(data: unknown): string {
  if (!data) return "";
  if (typeof data === "string") {
    // pode vir como JSON string ou o próprio token
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
    // React Native WebView (padrão)
    const rn = (window as unknown as { ReactNativeWebView?: { postMessage: (msg: string) => void } })
      .ReactNativeWebView;
    rn?.postMessage?.(JSON.stringify({ type: "REQUEST_SASI_TOKEN" }));
  } catch {
    // ignore
  }
  try {
    // Caso seja um iframe/host web que escute postMessage
    window.parent?.postMessage?.({ type: "REQUEST_SASI_TOKEN" }, "*");
  } catch {
    // ignore
  }
}

function humanizeEnum(s: string) {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function safeParseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function FieldRow({
  label,
  value,
  editable,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  editable?: boolean;
  onChange?: (next: string) => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <div className={styles.row}>
      <div className={styles.label}>{label}</div>
      {editable ? (
        <input
          className="ds-control ds-sm"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          inputMode={inputMode}
        />
      ) : (
        <div className={styles.value}>{value || "-"}</div>
      )}
    </div>
  );
}

export default function MeusDadosPage() {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<SasiMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState<EditableDraft | null>(null);
  const [profilePhoto, setProfilePhoto] = useState<string>(defaultProfilePhoto);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [qrError, setQrError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Recarrega toda vez que entrar na página (mount)
  useEffect(() => {
    const urlToken = getTokenFromUrl();
    if (urlToken) {
      persistToken(urlToken);
      removeTokenFromUrl();
    }

    const t = urlToken || getTokenFromStorage();
    // evita setState síncrono no effect (lint)
    setTimeout(() => setToken(t), 0);
  }, []);

  // Bridge do WebView: receber token automaticamente do host/app
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const t = extractTokenFromMessage((ev as unknown as { data?: TokenMessage }).data);
      if (!t) return;
      persistToken(t);
      setToken(t);
    }

    window.addEventListener("message", onMessage);
    // iOS/WKWebView às vezes usa document
    document.addEventListener("message" as never, onMessage as never);

    // Se ainda não tem token, pede pro host enviar
    if (!getTokenFromStorage() && !getTokenFromUrl()) {
      requestTokenFromHost();
    }

    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("message" as never, onMessage as never);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      setMe(null);

      // Espera hidratar/ler token (URL/localStorage) antes de acusar erro.
      if (token === null) {
        setLoading(false);
        return;
      }

      if (!token) {
        setLoading(false);
        setError(
          "Não encontrei `id_sasi` (token). Se estiver em WebView, o host deve enviar o token via postMessage; como fallback, passe `?sasiToken=...` (ou `?sasi-token=...`) na URL, ou defina `localStorage.setItem('id_sasi','...')`.",
        );
        return;
      }

      try {
        const res = await fetch("/api/sasi/me", {
          headers: { "x-sasi-token": token },
          cache: "no-store",
        });
        if (!res.ok) throw new Error(await res.text());
        const json = (await res.json()) as SasiMeResponse;
        if (cancelled) return;
        setMe(json);
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

  const fullName = useMemo(() => {
    return (
      me?.profileProps?.name ||
      me?.name ||
      ""
    );
  }, [me]);

  const cpf = me?.profileProps?.cpf || "";

  const qrPayload = useMemo(() => {
    if (!cpf || !fullName) return "";
    return JSON.stringify({ cpf, nome: fullName });
  }, [cpf, fullName]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!cpf || !fullName) {
        setQrDataUrl(null);
        setQrStatus("error");
        setQrError(!cpf ? "CPF não encontrado nos dados do usuário" : "Nome não encontrado nos dados do usuário");
        return;
      }
      if (!qrPayload) {
        setQrDataUrl(null);
        setQrStatus("idle");
        setQrError(null);
        return;
      }
      try {
        setQrStatus("loading");
        setQrError(null);
        const mod = await import("qrcode");
        const QRCode = ("default" in mod ? (mod.default as typeof mod) : mod) as unknown as {
          toDataURL: (
            text: string,
            options?: {
              width?: number;
              margin?: number;
              errorCorrectionLevel?: "L" | "M" | "Q" | "H";
            },
          ) => Promise<string>;
        };
        const url = await QRCode.toDataURL(qrPayload, {
          width: 185,
          margin: 1,
          errorCorrectionLevel: "M",
        });
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
  }, [qrPayload]);

  const baseDraft = useMemo<EditableDraft>(() => {
    return {
      dataNascimento: me?.profileProps?.data_nascimento || "",
      genero: me?.profileProps?.genero ? humanizeEnum(me.profileProps.genero) : "",
      email: me?.profileProps?.email || me?.customProps?.email || "",
      phone: me?.profileProps?.phone || me?.customProps?.phone || "",
      rg: me?.profileProps?.documento_rg || "",
      sus: me?.profileProps?.documento_sus || "",
      cep: me?.profileProps?.pessoal_cep || "",
      bairro: me?.profileProps?.pessoal_bairro || "",
      rua: me?.profileProps?.pessoal_rua || "",
      numero: me?.profileProps?.pessoal_numero || "",
      complemento: me?.profileProps?.pessoal_complemento || "",
      uf: me?.profileProps?.pessoal_uf || "",
      cidade: me?.profileProps?.pessoal_cidade || "",
      estadoCivil: me?.profileProps?.estado_civil || "",
      escolaridade: me?.profileProps?.escolaridade ? humanizeEnum(me.profileProps.escolaridade) : "",
      profissao: me?.profileProps?.profissao || "",
      renda: me?.profileProps?.renda || "",
    };
  }, [me]);

  // Carrega overrides e foto do localStorage (persistência local do aparelho)
  useEffect(() => {
    const savedDraft = safeParseJson<Partial<EditableDraft>>(localStorage.getItem(DRAFT_STORAGE_KEY));
    const savedPhoto = localStorage.getItem(PHOTO_STORAGE_KEY);
    // evita setState síncrono no effect (lint)
    setTimeout(() => {
      if (savedPhoto) setProfilePhoto(savedPhoto);
      setDraft({ ...baseDraft, ...(savedDraft || {}) });
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseDraft]);

  function startEditing() {
    setMenuOpen(false);
    setIsEditing(true);
    setDraft((d) => d || baseDraft);
  }

  function cancelEditing() {
    setMenuOpen(false);
    setIsEditing(false);
    const savedDraft = safeParseJson<Partial<EditableDraft>>(localStorage.getItem(DRAFT_STORAGE_KEY));
    setDraft({ ...baseDraft, ...(savedDraft || {}) });
  }

  function saveEditing() {
    if (!draft) return;
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // ignore
    }
    const notifyTest = (process.env.NEXT_PUBLIC_SASI_NOTIFY_TEST || "").trim().toLowerCase() === "true";
    const channelIdFromEnv = Number((process.env.NEXT_PUBLIC_SASI_CHANNEL_ID || "").trim());
    const channelId = Number.isFinite(channelIdFromEnv) && channelIdFromEnv > 0 ? channelIdFromEnv : 27642;
    // Salva tudo junto no banco (upsert por CPF, sem replicar)
    if (cpf && fullName) {
      void fetch("/api/dados-usuarios", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cpf,
          nome: fullName,
          sasi_me: me,
          draft_overrides: draft,
          profile_photo: profilePhoto,
          qr_payload: qrPayload || null,
        }),
      }).catch(() => {
        // ignore (persistência local continua funcionando)
      });

      // Notifica o SASI (monitoramento) via /api/v2/providers/messages/{id}/notify
      const sessionUuid = getOrCreateNotifySessionUuid();
      void fetch("/api/sasi/notify", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sasi-token": token || "",
        },
        body: JSON.stringify({
          payload: {
            text: "Finalizado",
            test: notifyTest,
            anonymous: false,
            priority: 1,
            channelId,
            data: {
              user: me,
              draft_overrides: draft,
              profile_photo: profilePhoto,
              qr_payload: qrPayload || null,
            },
            dataComments: {},
            dataAttachments: [],
            uuid: sessionUuid,
          },
        }),
      }).catch(() => {
        // ignore
      });
    }
    setMenuOpen(false);
    setIsEditing(false);
  }

  function triggerPhotoPicker() {
    setMenuOpen(false);
    fileInputRef.current?.click();
  }

  async function onPickPhoto(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const maxBytes = 2 * 1024 * 1024; // 2MB
    if (file.size > maxBytes) {
      setError("A imagem é muito grande. Escolha uma foto de até 2MB.");
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Falha ao ler imagem"));
        reader.readAsDataURL(file);
      });
      if (!dataUrl) return;
      setProfilePhoto(dataUrl);
      localStorage.setItem(PHOTO_STORAGE_KEY, dataUrl);
    } catch {
      setError("Não foi possível carregar a imagem.");
    }
  }

  const qrCode = me?.customProps?.code || "";

  return (
    <div className={styles.page} data-node-id="79:490">
      <header className={styles.header}>
        <div className={styles.headerGradient} />
        <div className={styles.headerStripe} />

        <img className={styles.logo} src={imgImage1585} alt="Prefeitura de Manaus" />

        <div className={styles.photoWrap}>
          <img className={styles.photo} src={profilePhoto} alt="Foto do perfil" />
        </div>

        <button
          className={styles.editButton}
          type="button"
          aria-label="Opções de edição"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <img src={imgVector} alt="" width={24} height={24} />
        </button>

        {menuOpen ? (
          <div className={styles.editMenu} role="menu" aria-label="Menu de edição">
            <button className={styles.menuItem} type="button" role="menuitem" onClick={triggerPhotoPicker}>
              Alterar foto
            </button>
            <button className={styles.menuItem} type="button" role="menuitem" onClick={startEditing}>
              Editar campos
            </button>
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          className={styles.fileInput}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0] || null;
            void onPickPhoto(file);
            // permite escolher o mesmo arquivo novamente
            e.currentTarget.value = "";
          }}
        />

        <div className={styles.badge} aria-label="Categoria Ouro">
          <div className={styles.dots} aria-hidden="true">
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
          </div>
          <div className={styles.badgeLabel}>Ouro</div>
        </div>
      </header>

      {error ? <div className={styles.error}>{error}</div> : null}

      <main className={styles.content} aria-busy={loading}>
        <section className={styles.card}>
          <div className={styles.cardInner}>
            <div className={styles.cardTitle}>Dados Pessoais</div>
            <FieldRow label="Nome Completo:" value={loading ? "Carregando..." : fullName} />
            <FieldRow
              label="Data de Nascimento:"
              value={draft?.dataNascimento || ""}
              editable={isEditing}
              onChange={(v) => setDraft((d) => (d ? { ...d, dataNascimento: v } : d))}
              inputMode="numeric"
            />
            <FieldRow
              label="Gênero:"
              value={draft?.genero || ""}
              editable={isEditing}
              onChange={(v) => setDraft((d) => (d ? { ...d, genero: v } : d))}
            />
            <FieldRow
              label="E-mail:"
              value={draft?.email || ""}
              editable={isEditing}
              onChange={(v) => setDraft((d) => (d ? { ...d, email: v } : d))}
              inputMode="email"
            />
            <FieldRow
              label="Telefone:"
              value={draft?.phone || ""}
              editable={isEditing}
              onChange={(v) => setDraft((d) => (d ? { ...d, phone: v } : d))}
              inputMode="tel"
            />
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardInner}>
            <div className={styles.cardTitle}>Documentos</div>
            <FieldRow
              label="RG:"
              value={draft?.rg || ""}
              editable={isEditing}
              onChange={(v) => setDraft((d) => (d ? { ...d, rg: v } : d))}
            />
            <FieldRow label="CPF:" value={cpf} />
            <FieldRow
              label="Carteirinha do SUS:"
              value={draft?.sus || ""}
              editable={isEditing}
              onChange={(v) => setDraft((d) => (d ? { ...d, sus: v } : d))}
            />
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardInner}>
            <div className={styles.cardTitle}>Endereço</div>
            <FieldRow
              label="CEP:"
              value={draft?.cep || ""}
              editable={isEditing}
              onChange={(v) => setDraft((d) => (d ? { ...d, cep: v } : d))}
              inputMode="numeric"
            />
            <FieldRow
              label="Bairro:"
              value={draft?.bairro || ""}
              editable={isEditing}
              onChange={(v) => setDraft((d) => (d ? { ...d, bairro: v } : d))}
            />
            <FieldRow
              label="Rua:"
              value={draft?.rua || ""}
              editable={isEditing}
              onChange={(v) => setDraft((d) => (d ? { ...d, rua: v } : d))}
            />
            <FieldRow
              label="Número:"
              value={draft?.numero || ""}
              editable={isEditing}
              onChange={(v) => setDraft((d) => (d ? { ...d, numero: v } : d))}
              inputMode="numeric"
            />
            <FieldRow
              label="Complemento:"
              value={draft?.complemento || ""}
              editable={isEditing}
              onChange={(v) => setDraft((d) => (d ? { ...d, complemento: v } : d))}
            />
            <FieldRow
              label="UF:"
              value={draft?.uf || ""}
              editable={isEditing}
              onChange={(v) => setDraft((d) => (d ? { ...d, uf: v } : d))}
            />
            <FieldRow
              label="Cidade:"
              value={draft?.cidade || ""}
              editable={isEditing}
              onChange={(v) => setDraft((d) => (d ? { ...d, cidade: v } : d))}
            />
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardInner}>
            <div className={styles.cardTitle}>Outras Informações</div>
            <FieldRow
              label="Estado Civil:"
              value={draft?.estadoCivil || ""}
              editable={isEditing}
              onChange={(v) => setDraft((d) => (d ? { ...d, estadoCivil: v } : d))}
            />
            <FieldRow
              label="Escolaridade:"
              value={draft?.escolaridade || ""}
              editable={isEditing}
              onChange={(v) => setDraft((d) => (d ? { ...d, escolaridade: v } : d))}
            />
            <FieldRow
              label="Profissão:"
              value={draft?.profissao || ""}
              editable={isEditing}
              onChange={(v) => setDraft((d) => (d ? { ...d, profissao: v } : d))}
            />
            <FieldRow
              label="Renda:"
              value={draft?.renda || ""}
              editable={isEditing}
              onChange={(v) => setDraft((d) => (d ? { ...d, renda: v } : d))}
            />
          </div>
        </section>

        {isEditing ? (
          <div className={styles.actionsBar} role="group" aria-label="Ações de edição">
            <button className={styles.secondaryButton} type="button" onClick={cancelEditing}>
              Cancelar
            </button>
            <button className={styles.primaryButton} type="button" onClick={saveEditing}>
              Salvar
            </button>
          </div>
        ) : null}

        <section className={styles.qrCard}>
          <div className={styles.cardTitle}>QR Code</div>
          <div className={styles.qrBox} aria-label="QR Code">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR" width={185} height={185} />
            ) : (
              <div className={styles.qrHint} aria-live="polite">
                {qrStatus === "loading" ? "Gerando QR…" : "QR indisponível"}
              </div>
            )}
          </div>
          <div className={styles.qrHint}>
            <div className={styles.qrHintTitle}>Apresente este código no atendimento</div>
            <div className={styles.qrHintCode}>{qrCode || (cpf && fullName ? `${cpf} · ${fullName}` : "-")}</div>
            {qrStatus === "loading" ? <div className={styles.qrHintCode}>Gerando QR…</div> : null}
            {qrStatus === "error" ? (
              <div className={styles.qrHintCode}>Falha ao gerar QR: {qrError || "erro desconhecido"}</div>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}

