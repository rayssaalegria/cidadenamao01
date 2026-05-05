"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

type Medico = {
  id: number;
  created_at: string;
  nome: string;
  crm: string;
  especialidade: string | null;
  email?: string | null;
  telefone?: string | null;
  ativo: boolean;
};

type EspecialidadeOption = { label: string; value: string };

type EditDraft = {
  id: number;
  nome: string;
  crm: string;
  especialidade: string;
  email: string;
  telefone: string;
  ativo: boolean;
};

function toDraft(m: Medico): EditDraft {
  return {
    id: m.id,
    nome: m.nome || "",
    crm: m.crm || "",
    especialidade: m.especialidade || "",
    email: (m.email as string) || "",
    telefone: (m.telefone as string) || "",
    ativo: Boolean(m.ativo),
  };
}

export default function AdminMedicosPage() {
  const [list, setList] = useState<Medico[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [especialidades, setEspecialidades] = useState<EspecialidadeOption[]>([]);
  const [loadingEspecialidades, setLoadingEspecialidades] = useState(false);

  const [nome, setNome] = useState("");
  const [crm, setCrm] = useState("");
  const [especialidadeValue, setEspecialidadeValue] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [ativo, setAtivo] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState<EditDraft | null>(null);

  const canSave = useMemo(() => Boolean(nome.trim() && crm.trim()), [nome, crm]);
  const canSaveEdit = useMemo(() => Boolean(edit?.nome.trim() && edit?.crm.trim()), [edit]);

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
          email: email.trim() || null,
          telefone: telefone.trim() || null,
          ativo,
        }),
      });
      const json = (await res.json()) as { data?: Medico; error?: string };
      if (!res.ok) throw new Error(json.error || "Falha ao criar médico");

      setNome("");
      setCrm("");
      setEspecialidadeValue("");
      setEmail("");
      setTelefone("");
      setAtivo(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar médico");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveEdit() {
    if (!edit || !canSaveEdit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/medicos/${edit.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nome: edit.nome.trim(),
          crm: edit.crm.trim(),
          especialidade: edit.especialidade.trim() || null,
          email: edit.email.trim() || null,
          telefone: edit.telefone.trim() || null,
          ativo: edit.ativo,
        }),
      });
      const json = (await res.json()) as { data?: Medico; error?: string };
      if (!res.ok) throw new Error(json.error || "Falha ao atualizar médico");
      setEditOpen(false);
      setEdit(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar médico");
    } finally {
      setSaving(false);
    }
  }

  async function onToggleAtivo(m: Medico) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/medicos/${m.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ativo: !m.ativo }),
      });
      const json = (await res.json()) as { data?: Medico; error?: string };
      if (!res.ok) throw new Error(json.error || "Falha ao atualizar status");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar status");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Médicos</div>
          <div className={styles.subtitle}>Cadastrar, editar e ativar/inativar médicos</div>
        </div>
        <button className={styles.secondaryBtn} type="button" onClick={() => void load()} disabled={saving}>
          Atualizar
        </button>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.card} aria-busy={saving}>
        <div className={styles.cardTitle}>Novo médico</div>
        <div className={styles.grid}>
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

          <div className={styles.field}>
            <div className="ds-label">E-mail</div>
            <input className="ds-control ds-md" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Opcional" />
          </div>

          <div className={styles.field}>
            <div className="ds-label">Telefone</div>
            <input className="ds-control ds-md" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="Opcional" />
          </div>

          <label className={styles.checkbox}>
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Ativo
          </label>
        </div>

        <div className={styles.actions}>
          <button className={styles.primaryBtn} type="button" onClick={() => void onCreate()} disabled={!canSave || saving}>
            {saving ? "Salvando..." : "Cadastrar médico"}
          </button>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardTitle}>Lista</div>
        {loading ? (
          <div className={styles.muted}>Carregando…</div>
        ) : list.length ? (
          <div className={styles.list}>
            {list.map((m) => (
              <div key={m.id} className={styles.item}>
                <div className={styles.itemTop}>
                  <div className={styles.name}>{m.nome}</div>
                  <div className={styles.badges}>
                    <span className={styles.pill}>{m.ativo ? "Ativo" : "Inativo"}</span>
                    <button className={styles.smallBtn} type="button" onClick={() => void onToggleAtivo(m)} disabled={saving}>
                      {m.ativo ? "Inativar" : "Ativar"}
                    </button>
                    <button
                      className={styles.smallBtn}
                      type="button"
                      onClick={() => {
                        setEdit(toDraft(m));
                        setEditOpen(true);
                      }}
                      disabled={saving}
                    >
                      Editar
                    </button>
                  </div>
                </div>

                <div className={styles.metaRow}>
                  <div>
                    <strong>CRM:</strong> {m.crm}
                  </div>
                  <div>
                    <strong>Especialidade:</strong> {m.especialidade || "—"}
                  </div>
                  <div>
                    <strong>E-mail:</strong> {m.email || "—"}
                  </div>
                  <div>
                    <strong>Telefone:</strong> {m.telefone || "—"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.muted}>Nenhum médico cadastrado ainda.</div>
        )}
      </section>

      {editOpen && edit ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>Editar médico</div>
              <button
                className={styles.iconBtn}
                type="button"
                onClick={() => {
                  setEditOpen(false);
                  setEdit(null);
                }}
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <div className={styles.grid}>
              <div className={styles.field}>
                <div className="ds-label">
                  Nome <span className="ds-required">*</span>
                </div>
                <input
                  className="ds-control ds-md"
                  value={edit.nome}
                  onChange={(e) => setEdit({ ...edit, nome: e.target.value })}
                />
              </div>

              <div className={styles.field}>
                <div className="ds-label">
                  CRM <span className="ds-required">*</span>
                </div>
                <input
                  className="ds-control ds-md"
                  value={edit.crm}
                  onChange={(e) => setEdit({ ...edit, crm: e.target.value })}
                />
              </div>

              <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
                <div className="ds-label">Especialidade</div>
                <input
                  className="ds-control ds-md"
                  value={edit.especialidade}
                  onChange={(e) => setEdit({ ...edit, especialidade: e.target.value })}
                  placeholder="Opcional"
                />
              </div>

              <div className={styles.field}>
                <div className="ds-label">E-mail</div>
                <input
                  className="ds-control ds-md"
                  value={edit.email}
                  onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                  placeholder="Opcional"
                />
              </div>

              <div className={styles.field}>
                <div className="ds-label">Telefone</div>
                <input
                  className="ds-control ds-md"
                  value={edit.telefone}
                  onChange={(e) => setEdit({ ...edit, telefone: e.target.value })}
                  placeholder="Opcional"
                />
              </div>

              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={edit.ativo}
                  onChange={(e) => setEdit({ ...edit, ativo: e.target.checked })}
                />
                Ativo
              </label>
            </div>

            <div className={styles.modalActions}>
              <button
                className={styles.secondaryBtn}
                type="button"
                onClick={() => {
                  setEditOpen(false);
                  setEdit(null);
                }}
                disabled={saving}
              >
                Cancelar
              </button>
              <button className={styles.primaryBtn} type="button" onClick={() => void onSaveEdit()} disabled={!canSaveEdit || saving}>
                {saving ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

