import { useState, useEffect, useCallback } from "react";

async function apiFetch(url) {
  const res = await fetch(url, { credentials: "include" });
  let body = null;
  try {
    body = await res.json();
  } catch (_) {}
  if (!res.ok) throw { status: res.status, message: body?.error || `Erro (${res.status})` };
  return body;
}

function formatPrice(n) {
  return `R$ ${Number(n || 0).toFixed(2).replace(".", ",")}`;
}

export default function AdminDashboard() {
  const [status, setStatus] = useState("loading");
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    apiFetch("/api/admin/dashboard")
      .then((res) => {
        setData(res);
        setStatus("ready");
      })
      .catch((e) => {
        if (e.status === 401) setStatus("needsLogin");
        else if (e.status === 403) setStatus("denied");
        else setStatus("error");
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="ac-root">
      <style>{CSS}</style>
      <div className="ac-wrap">
        <div className="ac-topbar">
          <h1 className="ac-title">📊 Dashboard — MTL CRAFT</h1>
          <a className="ac-link" href="/admin/cupons">Cupons</a>
          <a className="ac-link" href="/admin/log">Log de ações</a>
        </div>

        {status === "loading" && <p className="ac-muted">Carregando...</p>}
        {status === "needsLogin" && (
          <div className="ac-card">
            <p>Você precisa entrar com sua conta do Discord pra acessar essa página.</p>
            <a className="ac-btn ac-btn-primary" href="/api/auth/discord/login">Entrar com Discord</a>
          </div>
        )}
        {status === "denied" && (
          <div className="ac-card"><p>🔒 Acesso restrito à equipe.</p></div>
        )}
        {status === "error" && (
          <div className="ac-card"><p>Não foi possível carregar os dados. Tenta recarregar.</p></div>
        )}

        {status === "ready" && data && (
          <>
            <div className="ac-grid-4">
              <div className="ac-stat-card">
                <span className="ac-stat-label">Faturamento hoje</span>
                <span className="ac-stat-value">{formatPrice(data.revenue.day)}</span>
              </div>
              <div className="ac-stat-card">
                <span className="ac-stat-label">Faturamento na semana</span>
                <span className="ac-stat-value">{formatPrice(data.revenue.week)}</span>
              </div>
              <div className="ac-stat-card">
                <span className="ac-stat-label">Faturamento no mês</span>
                <span className="ac-stat-value">{formatPrice(data.revenue.month)}</span>
              </div>
              <div className="ac-stat-card">
                <span className="ac-stat-label">Tickets abertos agora</span>
                <span className="ac-stat-value">{data.openTickets}</span>
              </div>
            </div>

            <div className="ac-card">
              <h2 className="ac-card-title">⏱️ Tempo médio até aprovar pagamento</h2>
              <p className="ac-big-number">
                {data.avgApprovalMinutes === null ? "—" : `${data.avgApprovalMinutes} min`}
              </p>
              <p className="ac-muted ac-small">Baseado nos últimos 500 pedidos aprovados.</p>
            </div>

            <div className="ac-card">
              <h2 className="ac-card-title">🏆 Kits mais vendidos</h2>
              {data.topItems.length === 0 ? (
                <p className="ac-muted">Nenhuma venda confirmada ainda.</p>
              ) : (
                <ol className="ac-rank-list">
                  {data.topItems.map((item, i) => (
                    <li key={item.name}>
                      <span className="ac-rank-pos">#{i + 1}</span>
                      <span className="ac-rank-name">{item.name}</span>
                      <span className="ac-rank-qty">{item.quantity} vendidos</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const CSS = `
.ac-root{ min-height:100vh; background:#05070A; color:#fff; font-family:'Inter', system-ui, sans-serif; padding:32px 16px; }
.ac-wrap{ max-width:900px; margin:0 auto; }
.ac-topbar{ display:flex; align-items:center; flex-wrap:wrap; gap:16px; margin-bottom:24px; }
.ac-title{ font-size:24px; font-weight:800; margin:0; }
.ac-link{ color:#60A5FA; font-size:13px; font-weight:700; text-decoration:none; }
.ac-link:hover{ text-decoration:underline; }
.ac-muted{ color:#8DA0BE; }
.ac-small{ font-size:12px; }
.ac-card{ background:#101722; border:1px solid rgba(96,165,250,0.14); border-radius:16px; padding:22px; margin-bottom:20px; }
.ac-card-title{ font-size:16px; font-weight:800; margin:0 0 14px; }
.ac-btn{ display:inline-flex; align-items:center; gap:6px; border-radius:10px; border:1px solid transparent; font-weight:700; font-size:13.5px; padding:10px 18px; cursor:pointer; text-decoration:none; }
.ac-btn-primary{ background:linear-gradient(135deg,#3B82F6,#1D4ED8); color:#fff; }
.ac-grid-4{ display:grid; grid-template-columns:repeat(2,1fr); gap:14px; margin-bottom:20px; }
@media (min-width:700px){ .ac-grid-4{ grid-template-columns:repeat(4,1fr); } }
.ac-stat-card{ background:#101722; border:1px solid rgba(96,165,250,0.14); border-radius:14px; padding:16px; display:flex; flex-direction:column; gap:6px; }
.ac-stat-label{ font-size:11.5px; color:#8DA0BE; text-transform:uppercase; letter-spacing:0.4px; }
.ac-stat-value{ font-family:'JetBrains Mono', monospace; font-size:20px; font-weight:800; color:#60A5FA; }
.ac-big-number{ font-family:'JetBrains Mono', monospace; font-size:32px; font-weight:800; margin:0 0 4px; }
.ac-rank-list{ display:flex; flex-direction:column; gap:10px; margin:0; padding:0; list-style:none; }
.ac-rank-list li{ display:flex; align-items:center; gap:12px; font-size:13.5px; background:rgba(255,255,255,0.03); border-radius:10px; padding:10px 14px; }
.ac-rank-pos{ font-family:'JetBrains Mono', monospace; color:#60A5FA; font-weight:800; width:28px; }
.ac-rank-name{ flex:1; font-weight:700; }
.ac-rank-qty{ color:#8DA0BE; font-size:12px; white-space:nowrap; }
`;
