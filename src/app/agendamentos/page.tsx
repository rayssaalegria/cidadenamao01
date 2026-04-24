"use client";

import { useEffect, useMemo, useState } from "react";
import type { SasiAgendamento, SasiMeResponse } from "@/lib/sasi";

function getTokenFromStorage() {
  try {
    return localStorage.getItem("sasi-token") || "";
  } catch {
    return "";
  }
}

export default function AgendamentosPage() {
  const [token, setToken] = useState("");
  const [me, setMe] = useState<SasiMeResponse | null>(null);
  const [data, setData] = useState<SasiAgendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(getTokenFromStorage());
  }, []);

  const profileId = useMemo(() => me?.id || "", [me]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      setMe(null);
      setData([]);

      if (!token) {
        setLoading(false);
        setError("Não encontrei `sasi-token` no localStorage.");
        return;
      }

      try {
        const meRes = await fetch("/api/sasi/me", {
          headers: { "x-sasi-token": token },
          cache: "no-store",
        });
        if (!meRes.ok) throw new Error(await meRes.text());
        const meJson = (await meRes.json()) as SasiMeResponse;
        if (cancelled) return;
        setMe(meJson);

        const agRes = await fetch(`/api/sasi/agendamentos?profileId=${encodeURIComponent(meJson.id)}`, {
          headers: { "x-sasi-token": token },
          cache: "no-store",
        });
        if (!agRes.ok) throw new Error(await agRes.text());
        const agJson = (await agRes.json()) as { data: SasiAgendamento[] };
        if (cancelled) return;
        setData(agJson.data || []);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Erro ao carregar agendamentos");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <h1 style={{ fontSize: 18, marginBottom: 8 }}>Agendamentos</h1>
      {error ? <div style={{ color: "#b00020" }}>{error}</div> : null}
      <div style={{ color: "#555", marginBottom: 12 }}>
        {loading ? "Carregando..." : profileId ? `profileId: ${profileId}` : null}
      </div>
      <pre style={{ whiteSpace: "pre-wrap", background: "#f6f7f9", padding: 12, borderRadius: 8 }}>
        {JSON.stringify(data, null, 2)}
      </pre>
      <div style={{ color: "#777", marginTop: 12, fontSize: 12 }}>
        Endpoint de agendamentos configurável por <code>SASI_AGENDAMENTOS_PATH</code>.
      </div>
    </div>
  );
}

