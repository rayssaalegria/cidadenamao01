"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

type Especialidade = { label: string; value: string };
type Local = { id: number; nome: string };
type SlotRow = { id: number; data: string; horario: string; ativo: boolean };

function todayIso() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function AgendaMedicaPage() {
  const [especialidades, setEspecialidades] = useState<Especialidade[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [especialidadeValue, setEspecialidadeValue] = useState("");
  const [localId, setLocalId] = useState<number | null>(null);
  const [data, setData] = useState(todayIso());
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("12:00");
  const [intervalMinutes, setIntervalMinutes] = useState(15);

  const [saving, setSaving] = useState(false);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const [espRes, locRes] = await Promise.all([fetch("/api/especialidades"), fetch("/api/locais")]);
        const espJson = (await espRes.json()) as { data?: Especialidade[]; error?: string };
        const locJson = (await locRes.json()) as { data?: Local[]; error?: string };
        if (!espRes.ok) throw new Error(espJson.error || "Falha ao carregar especialidades");
        if (!locRes.ok) throw new Error(locJson.error || "Falha ao carregar locais");
        if (cancelled) return;
        setEspecialidades(espJson.data || []);
        setLocais(locJson.data || []);
        const firstLocal = (locJson.data || [])[0];
        if (firstLocal && localId === null) setLocalId(firstLocal.id);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canLoadSlots = Boolean(especialidadeValue && localId && data);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!canLoadSlots) {
        setSlots([]);
        return;
      }
      setLoadingSlots(true);
      try {
        const res = await fetch(
          `/api/especialidades/disponibilidade?especialidade=${encodeURIComponent(especialidadeValue)}&localId=${encodeURIComponent(
            String(localId),
          )}&data=${encodeURIComponent(data)}`,
          { cache: "no-store" },
        );
        const json = (await res.json()) as { data?: SlotRow[]; error?: string };
        if (!res.ok) throw new Error(json.error || "Falha ao carregar horários");
        if (!cancelled) setSlots(json.data || []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar horários");
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [canLoadSlots, especialidadeValue, localId, data]);

  const selectedLocalName = useMemo(() => locais.find((l) => l.id === localId)?.nome || "", [locais, localId]);
  const selectedEspecialidadeLabel = useMemo(
    () => especialidades.find((e) => e.value === especialidadeValue)?.label || "",
    [especialidades, especialidadeValue],
  );

  async function salvarAgenda() {
    if (!especialidadeValue || !localId || !data) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/especialidades/disponibilidade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          especialidadeValue,
          localId,
          data,
          startTime,
          endTime,
          intervalMinutes,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; created?: number; error?: string };
      if (!res.ok) throw new Error(json.error || "Falha ao salvar agenda");
      // reload slots
      const reload = await fetch(
        `/api/especialidades/disponibilidade?especialidade=${encodeURIComponent(especialidadeValue)}&localId=${encodeURIComponent(
          String(localId),
        )}&data=${encodeURIComponent(data)}`,
        { cache: "no-store" },
      );
      const reloadJson = (await reload.json()) as { data?: SlotRow[] };
      setSlots(reloadJson.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar agenda");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.content} aria-busy={loading || saving || loadingSlots}>
        <div className={styles.headerRow}>
          <div className={styles.title14}>Agenda médica (disponibilidade)</div>
        </div>

        {error ? <div className={styles.muted}>{error}</div> : null}

        <section className={styles.card}>
          <div className={styles.field}>
            <div className={styles.inputLabel}>Especialidade</div>
            <div className={styles.selectLike}>
              <select
                className="ds-control ds-md"
                value={especialidadeValue}
                onChange={(e) => setEspecialidadeValue(e.target.value)}
                disabled={loading}
              >
                <option value="" disabled>
                  Selecione a especialidade
                </option>
                {especialidades.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
              <div aria-hidden="true">⌄</div>
            </div>
          </div>

          <div style={{ height: 12 }} />

          <div className={styles.field}>
            <div className={styles.inputLabel}>Local</div>
            <div className={styles.selectLike}>
              <select
                className="ds-control ds-md"
                value={localId ? String(localId) : ""}
                onChange={(e) => setLocalId(Number(e.target.value))}
                disabled={loading}
              >
                <option value="" disabled>
                  Selecione o local
                </option>
                {locais.map((l) => (
                  <option key={l.id} value={String(l.id)}>
                    {l.nome}
                  </option>
                ))}
              </select>
              <div aria-hidden="true">⌄</div>
            </div>
          </div>

          <div style={{ height: 12 }} />

          <div className={styles.row}>
            <div className={styles.field}>
              <div className={styles.inputLabel}>Data</div>
              <div className={styles.inputLike}>
                <input className="ds-control ds-md" type="date" value={data} onChange={(e) => setData(e.target.value)} />
              </div>
            </div>
            <div className={styles.field}>
              <div className={styles.inputLabel}>Intervalo</div>
              <div className={styles.selectLike}>
                <select
                  className="ds-control ds-md"
                  value={String(intervalMinutes)}
                  onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                >
                  <option value="15">15 min</option>
                </select>
                <div aria-hidden="true">⌄</div>
              </div>
            </div>
          </div>

          <div style={{ height: 12 }} />

          <div className={styles.row}>
            <div className={styles.field}>
              <div className={styles.inputLabel}>Início</div>
              <div className={styles.inputLike}>
                <input className="ds-control ds-md" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
            </div>
            <div className={styles.field}>
              <div className={styles.inputLabel}>Fim</div>
              <div className={styles.inputLike}>
                <input className="ds-control ds-md" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
          </div>

          <div style={{ height: 12 }} />

          <button
            className={styles.primaryButton}
            type="button"
            disabled={saving || loading || !especialidadeValue || !localId || !data}
            onClick={salvarAgenda}
          >
            {saving ? "Salvando..." : "Salvar horários"}
          </button>

          <div style={{ height: 8 }} />
          <div className={styles.muted}>
            {selectedEspecialidadeLabel && selectedLocalName
              ? `Você está editando: ${selectedEspecialidadeLabel} · ${selectedLocalName}`
              : "Selecione especialidade e local para editar."}
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.inputLabel}>Horários do dia</div>
          <div className={styles.muted}>
            {canLoadSlots ? `Data: ${data}` : "Selecione especialidade, local e data."}
          </div>
          <div style={{ height: 12 }} />
          <div className={styles.list}>
            {loadingSlots ? (
              <div className={styles.muted}>Carregando…</div>
            ) : canLoadSlots ? (
              slots.length ? (
                slots.map((s) => (
                  <div key={s.id} className={styles.slot}>
                    <div>{String(s.horario).slice(0, 5)}</div>
                    <div className={styles.muted}>{s.ativo ? "Ativo" : "Inativo"}</div>
                  </div>
                ))
              ) : (
                <div className={styles.muted}>Nenhum horário cadastrado para este dia.</div>
              )
            ) : (
              <div className={styles.muted}>—</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

