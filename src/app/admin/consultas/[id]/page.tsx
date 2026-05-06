"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import styles from "./page.module.css";

type ConsultaRow = {
  id: number;
  created_at: string;
  nome_completo: string | null;
  cpf: number | null;
  carteira_sus?: string | null;
  especialidade_agendar: string | null;
  tipo: string | null;
  data_consulta_date: string | null;
  horario_consulta_time: string | null;
  local_consulta: string | null;
  status: string | null;
  medico_id: number | null;
  medico_nome: string | null;
  slot_id?: number | null;
  channel_id?: number | null;
};

type MedicoRow = {
  id: number;
  nome: string;
  crm: string;
  especialidade: string | null;
  ativo: boolean;
};

function fmtCpf(n: number) {
  const d = String(n).replace(/\D/g, "");
  if (d.length !== 11) return String(n);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function maskCpf(value: string) {
  const d = String(value || "").replace(/\D/g, "").slice(0, 11);
  const p1 = d.slice(0, 3);
  const p2 = d.slice(3, 6);
  const p3 = d.slice(6, 9);
  const p4 = d.slice(9, 11);
  let out = p1;
  if (p2) out += `.${p2}`;
  if (p3) out += `.${p3}`;
  if (p4) out += `-${p4}`;
  return out;
}

function fmtDateBr(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export default function AdminConsultaDetalhePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = String(params?.id || "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [consulta, setConsulta] = useState<ConsultaRow | null>(null);
  const [activeTab, setActiveTab] = useState<"visao" | "exames" | "receitas" | "atestados" | "encaminhamento" | "historico">("visao");

  const [docProfissional, setDocProfissional] = useState("");
  const [docCrm, setDocCrm] = useState("");
  const [docEspecialidade, setDocEspecialidade] = useState("");
  const [docImageUrl, setDocImageUrl] = useState("");
  const [receitaTexto, setReceitaTexto] = useState("");
  const [atestadoTexto, setAtestadoTexto] = useState("");
  const [cpfPaciente, setCpfPaciente] = useState("");

  const headerMeta = useMemo(() => {
    if (!consulta) return "";
    const bits = [
      consulta.cpf ? `CPF: ${fmtCpf(consulta.cpf)}` : "CPF: -",
      consulta.data_consulta_date ? fmtDateBr(consulta.data_consulta_date) : "-",
      consulta.horario_consulta_time?.slice(0, 5) || "-",
      consulta.especialidade_agendar || "-",
    ];
    return bits.join(" • ");
  }, [consulta]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      setInfo(null);
      try {
        const res = await fetch(`/api/admin/consultas/${encodeURIComponent(id)}`, { cache: "no-store" });
        const json = (await res.json()) as { data?: ConsultaRow; error?: string };
        if (!res.ok) throw new Error(json.error || "Falha ao carregar consulta");
        if (cancelled) return;
        setConsulta(json.data || null);
        const medicoNome = String(json.data?.medico_nome || "").trim();
        if (medicoNome) setDocProfissional(medicoNome);
        setDocEspecialidade(String(json.data?.especialidade_agendar || "").trim());
        const cpfNum = json.data?.cpf;
        if (typeof cpfNum === "number" && Number.isFinite(cpfNum) && cpfNum > 0) setCpfPaciente(maskCpf(String(cpfNum)));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar consulta");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!consulta?.medico_id) return;
      try {
        const res = await fetch("/api/medicos", { cache: "no-store" });
        const json = (await res.json()) as { data?: MedicoRow[]; error?: string };
        if (!res.ok) throw new Error(json.error || "Falha ao carregar médicos");
        if (cancelled) return;
        const medico = (json.data || []).find((m) => m.id === consulta.medico_id) || null;
        if (!medico) return;
        setDocProfissional(medico.nome || "");
        setDocCrm(medico.crm || "");
        setDocEspecialidade(medico.especialidade || "");
      } catch {
        // silencioso: mantém valores já existentes
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [consulta?.medico_id]);

  const canGenerate = useMemo(() => {
    const digits = String(cpfPaciente || "").replace(/\D/g, "");
    return digits.length >= 11;
  }, [cpfPaciente]);

  async function salvarDocumento(kind: "receita" | "atestado") {
    if (!canGenerate) {
      setError("Preencha o CPF do paciente para gerar o documento.");
      return;
    }
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const endpoint = kind === "receita" ? "/api/receitas" : "/api/atestados";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cpf: cpfPaciente,
          profissional: docProfissional || null,
          crm: docCrm || null,
          especialidade: docEspecialidade || null,
          conteudo: kind === "atestado" ? atestadoTexto || null : kind === "receita" ? receitaTexto || null : undefined,
          imageUrl: docImageUrl || null,
          status: "Ativo",
        }),
      });
      const json = (await res.json()) as { ok?: boolean; id?: number; error?: string };
      if (!res.ok) throw new Error(json.error || "Falha ao salvar documento");
      setInfo(`${kind === "receita" ? "Receita" : "Atestado"} criado com sucesso (id: ${json.id ?? "-"})`);
      setDocImageUrl("");
      if (kind === "receita") setReceitaTexto("");
      if (kind === "atestado") setAtestadoTexto("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar documento");
    } finally {
      setSaving(false);
    }
  }

  async function onUploadReceitaFile(file: File | null) {
    if (!file) return;
    if (file.size > 2_000_000) {
      setError("Arquivo muito grande. Envie até 2MB.");
      return;
    }
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
        reader.onload = () => resolve(String(reader.result || ""));
        reader.readAsDataURL(file);
      });
      setDocImageUrl(dataUrl);
      setInfo("Arquivo anexado. Agora você pode gerar a receita.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao anexar arquivo");
    }
  }

  async function onUploadAtestadoFile(file: File | null) {
    if (!file) return;
    if (file.size > 2_000_000) {
      setError("Arquivo muito grande. Envie até 2MB.");
      return;
    }
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
        reader.onload = () => resolve(String(reader.result || ""));
        reader.readAsDataURL(file);
      });
      setDocImageUrl(dataUrl);
      setInfo("Arquivo anexado. Agora você pode gerar o atestado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao anexar arquivo");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <button className={styles.backBtn} type="button" onClick={() => router.back()} disabled={saving}>
          ← Voltar ao início
        </button>
      </div>

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.title}>{consulta?.nome_completo || (loading ? "Carregando..." : "Paciente")}</div>
          <div className={styles.subtitle}>{headerMeta}</div>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.actionBtn}
            type="button"
            onClick={() => {
              setInfo("Solicitação de exame: em breve.");
              setError(null);
              setActiveTab("exames");
            }}
            disabled={saving || loading}
          >
            Solicitar exame
          </button>
          <button className={styles.actionBtn} type="button" onClick={() => setActiveTab("atestados")} disabled={saving || loading}>
            Atestado
          </button>
          <button className={styles.actionBtnPrimary} type="button" onClick={() => setActiveTab("receitas")} disabled={saving || loading}>
            Receita
          </button>
        </div>
      </div>

      <div className={styles.tabBar}>
        <button type="button" className={`${styles.tabBtn} ${activeTab === "visao" ? styles.tabActive : ""}`} onClick={() => setActiveTab("visao")}>
          Visão Geral
        </button>
        <button type="button" className={`${styles.tabBtn} ${activeTab === "exames" ? styles.tabActive : ""}`} onClick={() => setActiveTab("exames")}>
          Exames
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "receitas" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("receitas")}
        >
          Receitas
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "atestados" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("atestados")}
        >
          Atestados
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "encaminhamento" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("encaminhamento")}
        >
          Encaminhamento
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "historico" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("historico")}
        >
          Histórico
        </button>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {info ? <div className={styles.info}>{info}</div> : null}

      <div className={styles.body}>
        {loading ? <div className={styles.muted}>Carregando…</div> : null}

        {!loading && consulta ? (
          <>
            {activeTab === "visao" ? (
              <div className={styles.cardsRow}>
                <section className={styles.card}>
                  <div className={styles.cardH}>Consulta</div>
                  <div className={styles.line}>
                    <span className={styles.k}>Status:</span> {consulta.status || "-"}
                  </div>
                  <div className={styles.line}>
                    <span className={styles.k}>Especialidade:</span> {consulta.especialidade_agendar || "-"}
                  </div>
                  <div className={styles.line}>
                    <span className={styles.k}>Local:</span> {consulta.local_consulta || "-"}
                  </div>
                  <div className={styles.line}>
                    <span className={styles.k}>Data/Hora:</span> {consulta.data_consulta_date ? fmtDateBr(consulta.data_consulta_date) : "-"} •{" "}
                    {consulta.horario_consulta_time?.slice(0, 5) || "-"}
                  </div>
                  <div className={styles.line}>
                    <span className={styles.k}>Médico:</span> {consulta.medico_nome || "-"}
                  </div>
                </section>

                <section className={styles.card}>
                  <div className={styles.cardH}>Paciente</div>
                  <div className={styles.line}>
                    <span className={styles.k}>Nome:</span> {consulta.nome_completo || "-"}
                  </div>
                  <div className={styles.line}>
                    <span className={styles.k}>CPF:</span> {typeof consulta.cpf === "number" ? fmtCpf(consulta.cpf) : "-"}
                  </div>
                  <div className={styles.line}>
                    <span className={styles.k}>Cartão SUS:</span> {consulta.carteira_sus || "-"}
                  </div>
                </section>
              </div>
            ) : null}

            {activeTab === "receitas" || activeTab === "atestados" ? (
              <section className={styles.cardFull}>
                <div className={styles.cardH}>{activeTab === "receitas" ? "Receita" : "Atestado"}</div>

                <div className={styles.formGrid}>
                  <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
                    <div className={styles.label}>CPF do paciente</div>
                    <input
                      className={styles.input}
                      value={cpfPaciente}
                      onChange={(e) => setCpfPaciente(maskCpf(e.target.value))}
                      placeholder="Digite o CPF do paciente"
                      inputMode="numeric"
                    />
                    <div className={styles.hint}>Obrigatório para gerar receita/atestado.</div>
                  </div>

                  {activeTab === "receitas" ? (
                    <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
                      <div className={styles.label}>Conteúdo da receita</div>
                      <textarea
                        className={styles.textarea}
                        value={receitaTexto}
                        onChange={(e) => setReceitaTexto(e.target.value)}
                        placeholder="Digite aqui a receita (opcional)."
                        rows={5}
                      />
                      <div className={styles.hint}>Você pode preencher por texto ou anexar um arquivo/Imagem abaixo.</div>
                    </div>
                  ) : null}
                  {activeTab === "atestados" ? (
                    <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
                      <div className={styles.label}>Conteúdo do atestado</div>
                      <textarea
                        className={styles.textarea}
                        value={atestadoTexto}
                        onChange={(e) => setAtestadoTexto(e.target.value)}
                        placeholder="Digite aqui o atestado (opcional)."
                        rows={5}
                      />
                      <div className={styles.hint}>Você pode preencher por texto ou anexar um arquivo/Imagem abaixo.</div>
                    </div>
                  ) : null}

                  <div className={styles.field}>
                    <div className={styles.label}>Profissional</div>
                    <input className={styles.input} value={docProfissional} readOnly disabled />
                  </div>
                  <div className={styles.field}>
                    <div className={styles.label}>CRM</div>
                    <input className={styles.input} value={docCrm} readOnly disabled />
                  </div>
                  <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
                    <div className={styles.label}>Especialidade</div>
                    <input className={styles.input} value={docEspecialidade} readOnly disabled />
                  </div>
                  <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
                    <div className={styles.label}>{activeTab === "receitas" || activeTab === "atestados" ? "Anexo (upload) ou URL" : "Imagem (URL)"}</div>
                    {activeTab === "receitas" ? (
                      <>
                        <input
                          className={styles.file}
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => void onUploadReceitaFile(e.target.files?.[0] || null)}
                        />
                        <div className={styles.hint}>Aceita imagem/PDF (até 2MB). Se preferir, cole uma URL abaixo.</div>
                      </>
                    ) : null}
                    {activeTab === "atestados" ? (
                      <>
                        <input
                          className={styles.file}
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => void onUploadAtestadoFile(e.target.files?.[0] || null)}
                        />
                        <div className={styles.hint}>Aceita imagem/PDF (até 2MB). Se preferir, cole uma URL abaixo.</div>
                      </>
                    ) : null}
                    <input className={styles.input} value={docImageUrl} onChange={(e) => setDocImageUrl(e.target.value)} placeholder="Cole a URL da imagem/arquivo" />
                    <div className={styles.hint}>Opcional. Se enviar upload, o sistema usa um anexo embutido (data URL).</div>
                  </div>
                </div>

                <div className={styles.docActions}>
                  <button className={styles.cancelBtn} type="button" onClick={() => router.back()} disabled={saving}>
                    Voltar
                  </button>
                  {activeTab === "receitas" ? (
                    <button className={styles.primaryBtn} type="button" onClick={() => void salvarDocumento("receita")} disabled={saving || !canGenerate}>
                      Gerar receita
                    </button>
                  ) : (
                    <button className={styles.warnBtn} type="button" onClick={() => void salvarDocumento("atestado")} disabled={saving || !canGenerate}>
                      Gerar atestado
                    </button>
                  )}
                </div>
              </section>
            ) : null}

            {activeTab === "exames" || activeTab === "encaminhamento" || activeTab === "historico" ? (
              <section className={styles.cardFull}>
                <div className={styles.cardH}>
                  {activeTab === "exames" ? "Solicitação de exames" : activeTab === "encaminhamento" ? "Encaminhamento" : "Histórico"}
                </div>
                <div className={styles.muted}>
                  Esta aba está pronta no layout; vamos conectar o fluxo completo (criação/listagem) na próxima etapa.
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

