"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

type Medico = { id: number; nome: string; crm: string; especialidade: string | null; ativo: boolean };
type Slot = {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  status: "available" | "booked" | "blocked" | "cancelled";
};

function hhmm(v: string) {
  return String(v || "").slice(0, 5);
}

export default function AdminCalendarioPage() {
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [loadingMedicos, setLoadingMedicos] = useState(true);
  const [doctorId, setDoctorId] = useState<string>("");

  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<string>("");

  const [list, setList] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canLoad = useMemo(() => Boolean(doctorId && date), [doctorId, date]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoadingMedicos(true);
      try {
        const res = await fetch("/api/medicos", { cache: "no-store" });
        const json = (await res.json()) as { data?: Medico[]; error?: string };
        if (!res.ok) throw new Error(json.error || "Falha ao carregar médicos");
        if (!cancelled) setMedicos((json.data || []).filter((m) => m.ativo));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar médicos");
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
    if (!canLoad) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ date });
      if (status) qs.set("status", status);
      const res = await fetch(`/api/admin/doctors/${doctorId}/slots?${qs.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as { data?: Slot[]; error?: string };
      if (!res.ok) throw new Error(json.error || "Falha ao carregar agenda");
      setList(json.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar agenda");
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId, date, status]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Calendário (diário)</div>
          <div className={styles.subtitle}>Visão diária por médico com status dos horários</div>
        </div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.card}>
        <div className={styles.filters}>
          <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
            <div className="ds-label">
              Médico <span className="ds-required">*</span>
            </div>
            <select className="ds-control ds-md" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} disabled={loadingMedicos}>
              <option value="">{loadingMedicos ? "Carregando..." : "Selecione"}</option>
              {medicos.map((m) => (
                <option key={m.id} value={String(m.id)}>
                  {m.nome} • {m.crm} {m.especialidade ? `• ${m.especialidade}` : ""}
                </option>
              ))}
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
              <option value="available">Disponível</option>
              <option value="booked">Ocupado</option>
              <option value="blocked">Bloqueado</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardTitle}>Agenda do dia ({list.length})</div>
        {loading ? (
          <div className={styles.muted}>Carregando…</div>
        ) : !doctorId ? (
          <div className={styles.muted}>Selecione um médico.</div>
        ) : list.length ? (
          <div className={styles.timeline}>
            {list.map((s) => (
              <div key={s.id} className={styles.slotRow}>
                <div className={styles.time}>
                  {hhmm(s.start_time)}–{hhmm(s.end_time)}
                </div>
                <div className={`${styles.badge} ${styles[`badge_${s.status}`]}`}>{s.status}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.muted}>Nenhum horário encontrado para o filtro.</div>
        )}
      </section>
    </div>
  );
}

