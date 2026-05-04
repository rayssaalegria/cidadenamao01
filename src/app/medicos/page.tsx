"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

type Medico = {
  id: number;
  created_at: string;
  nome: string;
  crm: string;
  especialidade: string | null;
  ativo: boolean;
};

type EspecialidadeOption = { label: string; value: string };

export default function MedicosPage() {
  const [list, setList] = useState<Medico[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulkInfo, setBulkInfo] = useState<string | null>(null);

  const [especialidades, setEspecialidades] = useState<EspecialidadeOption[]>([]);
  const [loadingEspecialidades, setLoadingEspecialidades] = useState(false);

  const [nome, setNome] = useState("");
  const [crm, setCrm] = useState("");
  const [especialidadeValue, setEspecialidadeValue] = useState("");

  const canSave = useMemo(() => Boolean(nome.trim() && crm.trim()), [nome, crm]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/medicos", { cache: "no-store" });
      const json = (await res.json()) as { data?: Medico[]; error?: string };
      if (!res.ok) throw new Error(json.error || "Falha ao carregar médicos");
      setList(json.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar médicos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoadingEspecialidades(true);
      try {
        const res = await fetch("/api/especialidades", { cache: "no-store" });
        const json = (await res.json()) as { data?: EspecialidadeOption[]; error?: string };
        if (!res.ok) throw new Error(json.error || "Falha ao carregar especialidades");
        if (!cancelled) setEspecialidades(json.data || []);
      } catch {
        if (!cancelled) setEspecialidades([]);
      } finally {
        if (!cancelled) setLoadingEspecialidades(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onCreate() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const selectedEspecialidadeLabel =
        especialidades.find((e) => e.value === especialidadeValue)?.label || "";

      const res = await fetch("/api/medicos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          crm: crm.trim(),
          especialidade: selectedEspecialidadeLabel || null,
          ativo: true,
        }),
      });
      const json = (await res.json()) as { data?: Medico; error?: string };
      if (!res.ok) throw new Error(json.error || "Falha ao criar médico");
      setNome("");
      setCrm("");
      setEspecialidadeValue("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar médico");
    } finally {
      setSaving(false);
    }
  }

  async function onUploadCsv(file: File | null) {
    if (!file) return;
    setBulkInfo(null);
    setError(null);
    setBulkSaving(true);
    try {
      const csv = await file.text();
      const res = await fetch("/api/medicos/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const json = (await res.json()) as { ok?: boolean; upserted?: number; error?: string; details?: string[] };
      if (!res.ok) throw new Error(json.error || (json.details || []).join(" | ") || "Falha ao importar CSV");
      setBulkInfo(`Importação concluída: ${json.upserted ?? 0} médicos cadastrados/atualizados.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao importar CSV");
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.content} aria-busy={loading || saving}>
        <div className={styles.headerRow}>
          <div className={styles.title14}>Médicos</div>
          <div className={styles.muted}>Cadastrar e listar médicos do sistema</div>
        </div>

        {error ? <div className={styles.error}>{error}</div> : null}
        {bulkInfo ? <div className={styles.card}>{bulkInfo}</div> : null}

        <section className={styles.card}>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <div className="ds-label">
                Nome <span className="ds-required">*</span>
              </div>
              <input className="ds-control ds-md" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do médico" />
            </div>

            <div className={styles.field}>
              <div className="ds-label">
                CRM <span className="ds-required">*</span>
              </div>
              <input className="ds-control ds-md" value={crm} onChange={(e) => setCrm(e.target.value)} placeholder="Ex: 12345-AM" />
            </div>

            <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
              <div className="ds-label">Especialidade</div>
              <select
                className="ds-control ds-md"
                value={especialidadeValue}
                onChange={(e) => setEspecialidadeValue(e.target.value)}
                disabled={loadingEspecialidades}
              >
                <option value="">{loadingEspecialidades ? "Carregando..." : "Selecione (opcional)"}</option>
                {especialidades.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
              <div className="ds-hint">Opcional. Você pode cadastrar mesmo sem especialidade.</div>
            </div>
          </div>

          <div className={styles.actionsRow}>
            <label className={styles.secondaryBtn} style={{ display: "inline-flex", alignItems: "center" }}>
              {bulkSaving ? "Importando..." : "Cadastrar por CSV"}
              <input
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                disabled={bulkSaving}
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0] || null;
                  void onUploadCsv(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            <button className={styles.secondaryBtn} type="button" onClick={() => void load()} disabled={saving}>
              Atualizar lista
            </button>
            <button className={styles.primaryBtn} type="button" onClick={() => void onCreate()} disabled={!canSave || saving}>
              {saving ? "Salvando..." : "Cadastrar médico"}
            </button>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.title14}>Lista de médicos</div>
          <div style={{ height: 10 }} />

          {loading ? (
            <div className={styles.muted}>Carregando…</div>
          ) : list.length ? (
            <div className={styles.list}>
              {list.map((m) => (
                <div key={m.id} className={styles.item}>
                  <div className={styles.itemTop}>
                    <div className={styles.name}>{m.nome}</div>
                    <div className={styles.pill}>{m.ativo ? "Ativo" : "Inativo"}</div>
                  </div>
                  <div className={styles.metaRow}>
                    <div>
                      <strong>CRM:</strong> {m.crm}
                    </div>
                    <div>
                      <strong>Especialidade:</strong> {m.especialidade || "—"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.muted}>Nenhum médico cadastrado ainda.</div>
          )}
        </section>
      </main>
    </div>
  );
}

