"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";

type Medico = { id: number; nome: string; crm: string; especialidade: string | null; ativo: boolean };

type ConsultaRow = {
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
  medico_id: number | null;
  medico_nome: string | null;
};

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

export default function AdminConsultasPage() {
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [loadingMedicos, setLoadingMedicos] = useState(true);
  const [medicoId, setMedicoId] = useState<string>("");

  const [scope, setScope] = useState<"future" | "history" | "all">("future");
  const [date, setDate] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  const [list, setList] = useState<ConsultaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoadingMedicos(true);
      setError(null);
      try {
        const res = await fetch("/api/medicos", { cache: "no-store" });
        const json = (await res.json()) as { data?: Medico[]; error?: string };
        if (!res.ok) throw new Error(json.error || "Falha ao carregar médicos");
        const list = (json.data || []).filter((m) => m.ativo);
        if (cancelled) return;
        setMedicos(list);
        setMedicoId((prev) => (prev && list.some((m) => String(m.id) === prev) ? prev : String(list[0]?.id || "")));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar médicos");
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

  async function load() {
    if (!medicoId) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const qs = new URLSearchParams();
      qs.set("medicoId", medicoId);
      qs.set("scope", scope);
      if (date) qs.set("date", date);
      if (status) qs.set("status", status);
      const res = await fetch(`/api/admin/consultas?${qs.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as { data?: ConsultaRow[]; error?: string };
      if (!res.ok) throw new Error(json.error || "Falha ao carregar consultas");
      setList(json.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar consultas");
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medicoId, scope, date, status]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Consultas (web)</div>
          <div className={styles.subtitle}>Selecione um médico e veja os atendimentos para gerar receita/atestado</div>
        </div>
        <button className={styles.secondaryBtn} type="button" onClick={() => void load()} disabled={loading}>
          Atualizar
        </button>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {info ? <div className={styles.info}>{info}</div> : null}

      <section className={styles.card} aria-busy={loading}>
        <div className={styles.filters}>
          <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
            <div className="ds-label">Médico</div>
            <select className="ds-control ds-md" value={medicoId} onChange={(e) => setMedicoId(e.target.value)} disabled={loadingMedicos}>
              <option value="">{loadingMedicos ? "Carregando..." : "Selecione"}</option>
              {medicos.map((m) => (
                <option key={m.id} value={String(m.id)}>
                  {m.nome} • {m.crm} {m.especialidade ? `• ${m.especialidade}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <div className="ds-label">Período</div>
            <select className="ds-control ds-md" value={scope} onChange={(e) => setScope(e.target.value as any)}>
              <option value="future">Futuros</option>
              <option value="history">Histórico</option>
              <option value="all">Todos</option>
            </select>
          </div>

          <div className={styles.field}>
            <div className="ds-label">Data</div>
            <input className="ds-control ds-md" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className={styles.field}>
            <div className="ds-label">Status</div>
            <select className="ds-control ds-md" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="Agendada">Agendada</option>
              <option value="Concluída">Concluída</option>
              <option value="Cancelada">Cancelada</option>
            </select>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardTitle}>Lista ({list.length})</div>
        {loading ? (
          <div className={styles.muted}>Carregando…</div>
        ) : list.length ? (
          <div className={styles.list}>
            {list.map((c) => (
              <Link
                key={c.id}
                className={styles.item}
                href={`/admin/consultas/${c.id}`}
              >
                <div className={styles.itemTop}>
                  <div className={styles.name}>{c.nome_completo || "Paciente"}</div>
                  <div className={styles.pill}>{c.status || "-"}</div>
                </div>
                <div className={styles.meta}>
                  <div>
                    <strong>CPF:</strong> {typeof c.cpf === "number" ? fmtCpf(c.cpf) : "-"}
                  </div>
                  <div>
                    <strong>Data:</strong> {c.data_consulta_date ? fmtDateBr(c.data_consulta_date) : "-"} •{" "}
                    {c.horario_consulta_time?.slice(0, 5) || "-"}
                  </div>
                  <div>
                    <strong>Especialidade:</strong> {c.especialidade_agendar || "-"}
                  </div>
                  <div>
                    <strong>Local:</strong> {c.local_consulta || "-"}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.muted}>Nenhuma consulta encontrada.</div>
        )}
      </section>
    </div>
  );
}

