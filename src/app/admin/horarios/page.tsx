"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

type Medico = { id: number; nome: string; crm: string; especialidade: string | null; ativo: boolean };

type Slot = {
  id: number;
  doctor_id: number;
  availability_id: number;
  date: string;
  start_time: string;
  end_time: string;
  status: "available" | "booked" | "blocked" | "cancelled";
};

function hhmm(v: string) {
  return String(v || "").slice(0, 5);
}

export default function AdminHorariosPage() {
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [loadingMedicos, setLoadingMedicos] = useState(true);

  const [doctorId, setDoctorId] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  const [list, setList] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canSearch = useMemo(() => Boolean(doctorId), [doctorId]);

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
        if (!cancelled) setMedicos([]);
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

  async function loadSlots() {
    if (!canSearch) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const qs = new URLSearchParams();
      if (date) qs.set("date", date);
      if (status) qs.set("status", status);
      const res = await fetch(`/api/admin/doctors/${doctorId}/slots?${qs.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as { data?: Slot[]; error?: string };
      if (!res.ok) throw new Error(json.error || "Falha ao carregar horários");
      setList(json.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar horários");
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  async function onSetStatus(slot: Slot, newStatus: "available" | "blocked") {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/admin/doctors/${doctorId}/slots`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slotId: slot.id, status: newStatus }),
      });
      const json = (await res.json()) as { data?: Slot; error?: string };
      if (!res.ok) throw new Error(json.error || "Falha ao alterar status");
      setInfo("Status atualizado.");
      await loadSlots();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao alterar status");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(slot: Slot) {
    if (slot.status === "booked") return;
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/admin/slots/${slot.id}`, { method: "DELETE" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error || "Falha ao excluir horário");
      setInfo("Horário excluído.");
      await loadSlots();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao excluir horário");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Horários</div>
          <div className={styles.subtitle}>Filtre por médico e gerencie slots (bloquear/liberar/excluir futuros)</div>
        </div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {info ? <div className={styles.info}>{info}</div> : null}

      <section className={styles.card} aria-busy={saving}>
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

        <div className={styles.actions}>
          <button className={styles.secondaryBtn} type="button" onClick={() => void loadSlots()} disabled={!canSearch || loading || saving}>
            {loading ? "Carregando..." : "Buscar"}
          </button>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardTitle}>Resultados ({list.length})</div>
        {loading ? (
          <div className={styles.muted}>Carregando…</div>
        ) : list.length ? (
          <div className={styles.table}>
            <div className={styles.rowHead}>
              <div>Data</div>
              <div>Horário</div>
              <div>Status</div>
              <div className={styles.right}>Ações</div>
            </div>
            {list.map((s) => (
              <div key={s.id} className={styles.row}>
                <div>{s.date}</div>
                <div>
                  {hhmm(s.start_time)}–{hhmm(s.end_time)}
                </div>
                <div>
                  <span className={`${styles.status} ${styles[`status_${s.status}`]}`}>{s.status}</span>
                </div>
                <div className={`${styles.right} ${styles.actionsInline}`}>
                  <button
                    className={styles.smallBtn}
                    type="button"
                    onClick={() => void onSetStatus(s, "blocked")}
                    disabled={saving || s.status === "booked" || s.status === "blocked"}
                  >
                    Bloquear
                  </button>
                  <button
                    className={styles.smallBtn}
                    type="button"
                    onClick={() => void onSetStatus(s, "available")}
                    disabled={saving || s.status === "booked" || s.status === "available"}
                  >
                    Liberar
                  </button>
                  <button className={styles.dangerBtn} type="button" onClick={() => void onDelete(s)} disabled={saving || s.status === "booked"}>
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.muted}>Nenhum horário encontrado.</div>
        )}
      </section>
    </div>
  );
}

