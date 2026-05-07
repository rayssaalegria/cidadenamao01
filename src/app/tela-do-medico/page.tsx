"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

type PacienteItem = {
  cpf: number;
  nome: string | null;
  agendamentos: {
    id: number;
    tipo: string | null;
    especialidade_agendar: string | null;
    data_consulta_date: string | null;
    horario_consulta_time: string | null;
    local_consulta: string | null;
    status: string | null;
  }[];
};

type AgendamentoRow = {
  id: number;
  created_at: string;
  nome_completo: string | null;
  cpf: number | null;
  especialidade_agendar: string | null;
  tipo: string | null;
  data_consulta_date: string | null;
  horario_consulta_time: string | null;
  local_consulta: string | null;
  status: string | null;
};

type MedicoRow = {
  id: number;
  nome: string;
  crm: string;
  especialidade: string | null;
  ativo: boolean;
};

function isoTodayLocal() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtCpf(n: number) {
  const d = String(n).replace(/\D/g, "");
  if (d.length !== 11) return String(n);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function fmtDateBr(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export default function TelaDoMedicoPage() {
  const [date, setDate] = useState<string>(() => isoTodayLocal());
  const [patients, setPatients] = useState<PacienteItem[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);

  const [medicos, setMedicos] = useState<MedicoRow[]>([]);
  const [loadingMedicos, setLoadingMedicos] = useState(false);
  const [selectedMedicoId, setSelectedMedicoId] = useState<string>("");

  const [selectedCpf, setSelectedCpf] = useState<number | null>(null);
  const selectedPatient = useMemo(() => patients.find((p) => p.cpf === selectedCpf) || null, [patients, selectedCpf]);

  const [scopeTab, setScopeTab] = useState<"history" | "future">("future");
  const [agendamentos, setAgendamentos] = useState<AgendamentoRow[]>([]);
  const [loadingAg, setLoadingAg] = useState(false);

  const [profissional, setProfissional] = useState("");
  const [crm, setCrm] = useState("");
  const [especialidade, setEspecialidade] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedMedico = useMemo(
    () => medicos.find((m) => String(m.id) === selectedMedicoId) || null,
    [medicos, selectedMedicoId],
  );

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoadingMedicos(true);
      try {
        const res = await fetch("/api/medicos", { cache: "no-store" });
        const json = (await res.json()) as { data?: MedicoRow[]; error?: string };
        if (!res.ok) throw new Error(json.error || "Falha ao carregar médicos");
        if (cancelled) return;
        const list = (json.data || []).filter((m) => m.ativo);
        setMedicos(list);
        setSelectedMedicoId((prev) => (prev && list.some((m) => String(m.id) === prev) ? prev : String(list[0]?.id || "")));
      } catch {
        if (!cancelled) setMedicos([]);
      } finally {
        if (!cancelled) setLoadingMedicos(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Ao selecionar médico, preenche campos do documento automaticamente.
    if (!selectedMedico) return;
    setProfissional(selectedMedico.nome || "");
    setCrm(selectedMedico.crm || "");
    setEspecialidade(selectedMedico.especialidade || "");
  }, [selectedMedico]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoadingPatients(true);
      setError(null);
      setSuccess(null);
      try {
        const qs = new URLSearchParams();
        qs.set("date", date);
        if (especialidade.trim()) qs.set("especialidade", especialidade.trim());
        const res = await fetch(`/api/medico/pacientes?${qs.toString()}`, { cache: "no-store" });
        const json = (await res.json()) as { data?: PacienteItem[]; error?: string };
        if (!res.ok) throw new Error(json.error || "Falha ao carregar pacientes do dia");
        if (cancelled) return;
        const list = json.data || [];
        setPatients(list);
        setSelectedCpf((prev) => (prev && list.some((p) => p.cpf === prev) ? prev : list[0]?.cpf ?? null));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar pacientes");
      } finally {
        if (!cancelled) setLoadingPatients(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [date, especialidade]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!selectedCpf) return;
      setLoadingAg(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        qs.set("cpf", String(selectedCpf));
        qs.set("scope", scopeTab);
        if (especialidade.trim()) qs.set("especialidade", especialidade.trim());
        const res = await fetch(
          `/api/medico/agendamentos?${qs.toString()}`,
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
  }, [selectedCpf, scopeTab, especialidade]);

  async function salvarDocumento(kind: "receita" | "atestado") {
    if (!selectedCpf) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const endpoint = kind === "receita" ? "/api/receitas" : "/api/atestados";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cpf: String(selectedCpf),
          profissional: profissional || null,
          crm: crm || null,
          especialidade: especialidade || null,
          imageUrl: imageUrl || null,
          status: "Ativo",
        }),
      });
      const json = (await res.json()) as { ok?: boolean; id?: number; error?: string };
      if (!res.ok) throw new Error(json.error || "Falha ao salvar");
      setSuccess(`${kind === "receita" ? "Receita" : "Atestado"} salvo com sucesso (id: ${json.id ?? "-"})`);
      setImageUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar documento");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.content}>
        <section className={`${styles.card} ${styles.cardPad16}`}>
          <div className={styles.titleRow}>
            <div>
              <div className={styles.title}>Tela do médico</div>
              <div className={styles.subtitle}>Pacientes do dia, histórico, futuros agendamentos e documentos.</div>
            </div>
          </div>

          <div style={{ height: 12 }} />

          <div className={styles.inputRow}>
            <div className={styles.inputBlock}>
              <div className={styles.label}>Médico</div>
              <select
                className="ds-control ds-md"
                value={selectedMedicoId}
                onChange={(e) => setSelectedMedicoId(e.target.value)}
                disabled={loadingMedicos}
              >
                <option value="">{loadingMedicos ? "Carregando..." : "Selecione o médico"}</option>
                {medicos.map((m) => (
                  <option key={m.id} value={String(m.id)}>
                    {m.nome} ({m.crm})
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.inputBlock}>
              <div className={styles.label}>Data (agenda do dia)</div>
              <input className="ds-control ds-md" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
        </section>

        {error ? <div className={styles.error}>{error}</div> : null}
        {success ? <div className={styles.success}>{success}</div> : null}

        <section className={styles.grid}>
          <div className={`${styles.card} ${styles.cardPad16}`}>
            <div className={styles.label}>Pacientes de {fmtDateBr(date)}</div>
            <div style={{ height: 10 }} />
            {loadingPatients ? (
              <div className={styles.muted}>Carregando…</div>
            ) : patients.length ? (
              <div className={styles.patientsList}>
                {patients.map((p) => {
                  const active = p.cpf === selectedCpf;
                  const first = p.agendamentos[0];
                  return (
                    <button
                      key={p.cpf}
                      type="button"
                      className={[styles.patientBtn, active ? styles.patientBtnActive : ""].filter(Boolean).join(" ")}
                      onClick={() => setSelectedCpf(p.cpf)}
                    >
                      <div className={styles.patientName}>{p.nome || "Paciente"}</div>
                      <div className={styles.patientCpf}>CPF: {fmtCpf(p.cpf)}</div>
                      <div className={styles.patientMeta}>
                        <div>
                          <span className={styles.muted}>Próximo:</span>{" "}
                          {first?.horario_consulta_time?.slice(0, 5) || "--:--"} • {first?.especialidade_agendar || "-"}
                        </div>
                        <div className={styles.muted}>{first?.local_consulta || "-"}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className={styles.muted}>Nenhum paciente encontrado para essa data.</div>
            )}
          </div>

          <div className={`${styles.card}`}>
            <div className={styles.tabsBar} role="tablist" aria-label="Agendamentos do paciente">
              <button
                type="button"
                className={[styles.tabBtn, scopeTab === "future" ? styles.tabBtnActive : ""].filter(Boolean).join(" ")}
                onClick={() => setScopeTab("future")}
                role="tab"
                aria-selected={scopeTab === "future"}
              >
                <span className={styles.tabIcon} aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M7 3V5M17 3V5M4.5 9H19.5M6 4H18C19.1046 4 20 4.89543 20 6V19C20 20.1046 19.1046 21 18 21H6C4.89543 21 4 20.1046 4 19V6C4 4.89543 4.89543 4 6 4Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M12 12V16M12 12L15 14.2"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                Futuros
              </button>
              <button
                type="button"
                className={[styles.tabBtn, scopeTab === "history" ? styles.tabBtnActive : ""].filter(Boolean).join(" ")}
                onClick={() => setScopeTab("history")}
                role="tab"
                aria-selected={scopeTab === "history"}
              >
                <span className={styles.tabIcon} aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M3 12a9 9 0 1 0 3-6.7"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M3 3v5h5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M12 7v6l4 2"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                Histórico
              </button>
            </div>

            <div className={styles.cardPad16}>
              <div className={styles.label}>Paciente selecionado</div>
              <div style={{ height: 6 }} />
              <div className={styles.patientName}>{selectedPatient?.nome || "Selecione um paciente"}</div>
              <div className={styles.patientCpf}>{selectedCpf ? `CPF: ${fmtCpf(selectedCpf)}` : ""}</div>

              <div style={{ height: 14 }} />
              <div className={styles.label}>{scopeTab === "future" ? "Agendamentos futuros" : "Histórico de agendamentos"}</div>
              <div style={{ height: 10 }} />

              {loadingAg ? (
                <div className={styles.muted}>Carregando…</div>
              ) : agendamentos.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {agendamentos.map((a) => (
                    <div key={a.id} className={styles.apptCard}>
                      <div className={styles.apptTitle}>{a.especialidade_agendar || "-"}</div>
                      <div className={styles.rowBetween}>
                        <div>
                          {a.data_consulta_date ? fmtDateBr(a.data_consulta_date) : "-"} • {a.horario_consulta_time?.slice(0, 5) || "-"}
                        </div>
                        <div className={styles.muted}>{a.status || "-"}</div>
                      </div>
                      <div className={styles.rowBetween}>
                        <div className={styles.muted}>{a.local_consulta || "-"}</div>
                        <div className={styles.muted}>{a.tipo || "-"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.muted}>Sem registros.</div>
              )}

              <div style={{ height: 18 }} />
              <div className={styles.label}>Adicionar documentos (para o paciente)</div>
              <div style={{ height: 10 }} />

              <div className={styles.inputRow}>
                <div className={styles.inputBlock}>
                  <div className={styles.label}>Profissional</div>
                  <input className="ds-control ds-md" value={profissional} onChange={(e) => setProfissional(e.target.value)} placeholder="Nome do médico" />
                </div>
                <div className={styles.inputBlock}>
                  <div className={styles.label}>CRM</div>
                  <input className="ds-control ds-md" value={crm} onChange={(e) => setCrm(e.target.value)} placeholder="CRM" />
                </div>
              </div>

              <div className={styles.inputRow}>
                <div className={styles.inputBlock}>
                  <div className={styles.label}>Especialidade (filtro)</div>
                  <input
                    className="ds-control ds-md"
                    value={especialidade}
                    onChange={(e) => setEspecialidade(e.target.value)}
                    placeholder="Ex: Clínica Geral"
                  />
                  <div className={styles.muted}>Filtra pacientes e agendamentos do dia por especialidade.</div>
                </div>
              </div>

              <div className={styles.inputRow}>
                <div className={styles.inputBlock} style={{ flexBasis: "100%" }}>
                  <div className={styles.label}>Imagem (URL)</div>
                  <input className="ds-control ds-md" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Cole a URL da imagem do documento" />
                </div>
              </div>

              <div className={styles.inputRow}>
                <button className={styles.secondaryBtn} type="button" disabled={!selectedCpf || saving} onClick={() => salvarDocumento("atestado")}>
                  Salvar atestado
                </button>
                <button className={styles.primaryBtn} type="button" disabled={!selectedCpf || saving} onClick={() => salvarDocumento("receita")}>
                  Salvar receita
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

