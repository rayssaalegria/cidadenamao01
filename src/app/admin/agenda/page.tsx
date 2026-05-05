"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

type Medico = {
  id: number;
  nome: string;
  crm: string;
  especialidade: string | null;
  ativo: boolean;
};

type PreviewSlot = { start: string; end: string };

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parseHHmm(value: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm };
}

function previewSlots(startTime: string, endTime: string, duration: number, interval: number): PreviewSlot[] {
  const s = parseHHmm(startTime);
  const e = parseHHmm(endTime);
  if (!s || !e) return [];
  const startMin = s.hh * 60 + s.mm;
  const endMin = e.hh * 60 + e.mm;
  if (duration <= 0 || interval < 0 || endMin <= startMin) return [];
  const out: PreviewSlot[] = [];
  for (let t = startMin; t + duration <= endMin; ) {
    const endT = t + duration;
    const hh = Math.floor(t / 60);
    const mm = t % 60;
    const ehh = Math.floor(endT / 60);
    const emm = endT % 60;
    out.push({ start: `${pad(hh)}:${pad(mm)}`, end: `${pad(ehh)}:${pad(emm)}` });
    t = endT + interval;
  }
  return out;
}

export default function AdminAgendaConfigPage() {
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [loadingMedicos, setLoadingMedicos] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [doctorId, setDoctorId] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("08:00");
  const [endTime, setEndTime] = useState<string>("12:00");
  const [duration, setDuration] = useState<number>(30);
  const [interval, setInterval] = useState<number>(0);

  const slots = useMemo(() => previewSlots(startTime, endTime, duration, interval), [startTime, endTime, duration, interval]);
  const canSave = useMemo(() => Boolean(doctorId && date && slots.length), [doctorId, date, slots.length]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoadingMedicos(true);
      setError(null);
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

  async function onCreateAvailability() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/admin/doctors/${doctorId}/availability`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date,
          startTime,
          endTime,
          appointmentDurationMinutes: duration,
          intervalMinutes: interval,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; slotsCreated?: number };
      if (!res.ok) throw new Error(json.error || "Falha ao salvar disponibilidade");
      setInfo(`Disponibilidade criada. Slots gerados: ${json.slotsCreated ?? slots.length}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar disponibilidade");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Configurar agenda</div>
          <div className={styles.subtitle}>Selecione o médico e gere automaticamente os horários disponíveis</div>
        </div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {info ? <div className={styles.info}>{info}</div> : null}

      <section className={styles.card} aria-busy={saving}>
        <div className={styles.grid}>
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
            <div className="ds-label">
              Data <span className="ds-required">*</span>
            </div>
            <input className="ds-control ds-md" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className={styles.field}>
            <div className="ds-label">Duração (min)</div>
            <input
              className="ds-control ds-md"
              type="number"
              min={5}
              step={5}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value || 0))}
            />
          </div>

          <div className={styles.field}>
            <div className="ds-label">Início</div>
            <input className="ds-control ds-md" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>

          <div className={styles.field}>
            <div className="ds-label">Fim</div>
            <input className="ds-control ds-md" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>

          <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
            <div className="ds-label">Intervalo entre consultas (min)</div>
            <input
              className="ds-control ds-md"
              type="number"
              min={0}
              step={5}
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value || 0))}
            />
            <div className="ds-hint">Opcional. Use 0 para slots “encostados”.</div>
          </div>
        </div>

        <div className={styles.preview}>
          <div className={styles.previewTitle}>
            Preview dos horários ({slots.length})
          </div>
          {slots.length ? (
            <div className={styles.previewGrid}>
              {slots.map((s) => (
                <div key={`${s.start}-${s.end}`} className={styles.slotPill}>
                  {s.start}–{s.end}
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.muted}>Ajuste a janela/duração para gerar slots.</div>
          )}
        </div>

        <div className={styles.actions}>
          <button className={styles.primaryBtn} type="button" onClick={() => void onCreateAvailability()} disabled={!canSave || saving}>
            {saving ? "Gerando..." : "Salvar e gerar horários"}
          </button>
        </div>
      </section>
    </div>
  );
}

