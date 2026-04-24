"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";
import type { SasiMeResponse } from "@/lib/sasi";

const imgImage1584 =
  "https://www.figma.com/api/mcp/asset/a72795bd-b020-4ff5-be7a-f6d8f568f62b";
const imgImage1585 =
  "https://www.figma.com/api/mcp/asset/f1c34dd9-8fc5-43d7-94e0-bd66712f7bcc";
const imgQrElements =
  "https://www.figma.com/api/mcp/asset/a61de8b8-148f-4769-986e-a897f65defa7";
const imgVector =
  "https://www.figma.com/api/mcp/asset/bb94ae8c-fa9f-4909-9a97-0634d198f61e";

function getTokenFromStorage() {
  try {
    return localStorage.getItem("sasi-token") || "";
  } catch {
    return "";
  }
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.row}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{value || "-"}</div>
    </div>
  );
}

export default function MeusDadosPage() {
  const [token, setToken] = useState("");
  const [me, setMe] = useState<SasiMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Recarrega toda vez que entrar na página (mount)
  useEffect(() => {
    const t = getTokenFromStorage();
    setToken(t);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      setMe(null);

      if (!token) {
        setLoading(false);
        setError("Não encontrei `sasi-token` no localStorage. Defina `localStorage.setItem('sasi-token', '...')`.");
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

  const email = me?.profileProps?.email || me?.customProps?.email || "";
  const phone = me?.profileProps?.phone || me?.customProps?.phone || "";
  const cpf = me?.profileProps?.cpf || "";

  // Campos que não aparecem no payload exemplo: mantemos placeholders
  const dataNascimento = "";
  const genero = "";
  const rg = "";
  const sus = "";
  const cep = "";
  const bairro = "";
  const rua = "";
  const numero = "";
  const complemento = "";
  const uf = "";
  const cidade = "";
  const estadoCivil = "";
  const escolaridade = "";
  const profissao = "";
  const renda = "";

  const qrCode = me?.customProps?.code || "";

  return (
    <div className={styles.page} data-node-id="79:490">
      <header className={styles.header}>
        <div className={styles.headerGradient} />
        <div className={styles.headerStripe} />

        <img className={styles.logo} src={imgImage1585} alt="Prefeitura de Manaus" />

        <div className={styles.photoWrap}>
          <img className={styles.photo} src={imgImage1584} alt="Foto do perfil" />
        </div>

        <button className={styles.editButton} type="button" aria-label="Editar dados">
          <img src={imgVector} alt="" width={24} height={24} />
        </button>

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
            <FieldRow label="Data de Nascimento:" value={dataNascimento} />
            <FieldRow label="Gênero:" value={genero} />
            <FieldRow label="E-mail:" value={email} />
            <FieldRow label="Telefone:" value={phone} />
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardInner}>
            <div className={styles.cardTitle}>Documentos</div>
            <FieldRow label="RG:" value={rg} />
            <FieldRow label="CPF:" value={cpf} />
            <FieldRow label="Carteirinha do SUS:" value={sus} />
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardInner}>
            <div className={styles.cardTitle}>Endereço</div>
            <FieldRow label="CEP:" value={cep} />
            <FieldRow label="Bairro:" value={bairro} />
            <FieldRow label="Rua:" value={rua} />
            <FieldRow label="Número:" value={numero} />
            <FieldRow label="Complemento:" value={complemento} />
            <FieldRow label="UF:" value={uf} />
            <FieldRow label="Cidade:" value={cidade} />
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardInner}>
            <div className={styles.cardTitle}>Outras Informações</div>
            <FieldRow label="Estado Civil:" value={estadoCivil} />
            <FieldRow label="Escolaridade:" value={escolaridade} />
            <FieldRow label="Profissão:" value={profissao} />
            <FieldRow label="Renda:" value={renda} />
          </div>
        </section>

        <section className={styles.qrCard}>
          <div className={styles.cardTitle}>QR Code</div>
          <div className={styles.qrBox} aria-label="QR Code">
            <img src={imgQrElements} alt="QR" width={185} height={185} />
          </div>
          <div className={styles.qrHint}>
            <div className={styles.qrHintTitle}>Apresente este código no atendimento</div>
            <div className={styles.qrHintCode}>{qrCode || "-"}</div>
          </div>
        </section>
      </main>
    </div>
  );
}

