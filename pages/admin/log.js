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

const TYPE_META = {
  APROVOU: { emoji: "✅", label: "Aprovou pagamento", cls: "ac-badge-on" },
  RECUSOU: { emoji: "❌", label: "Recusou pagamento", cls: "ac-badge-off-red" },
  ENTREGOU: { emoji: "📦", label: "Marcou como entregue", cls: "ac-badge-blue" },
};

export default function AdminLog() {
  const [status, setStatus] = useState("loading");
  const [events, setEvents] = useState(null);

  const load = useCallback(() => {
    apiFetch("/api/admin/log")
      .then((res) => {
        setEvents(res.events);
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
          <h1 className="ac-title">📋 Log de ações — MTL CRAFT</h1>
          <a className="ac-link" href="/admin/dashboard">Dashboard</a>
          <a className="ac-link" href="/admin/cupons">Cupons</a>
        </div>

        {status === "loading" && <p className="ac-muted">Carregando...</p>}
        {status === "needsLogin" && (
          <div className="ac-card">
            <p>Você precisa entrar com sua conta do Discord pra acessar essa página.</p>
            <a className="ac-btn ac-btn-primary" href="/api/auth/discord/login">Entrar com Discord</a>
          </div>
        )}
        {status === "denied" && <div className="ac-card"><p>🔒 Acesso restrito à equipe.</p></div>}
        {status === "error" && <div className="ac-card"><p>Não foi possível carregar o log. Tenta recarregar.</p></div>}

        {status === "ready" && (
          <div className="ac-card">
            {events.length === 0 ? (
              <p className="ac-muted">Nenhuma ação registrada ainda.</p>
            ) : (
              <ul className="ac-log-list">
                {events.map((ev, i) => {
                  const meta = TYPE_META[ev.type];
                  return (
                    <li key={i} className="ac-log-item">
                      <span className={`ac-badge ${meta.cls}`}>{meta.emoji} {meta.label}</span>
                      <div className="ac-log-body">
                        <span className="ac-log-main">
                          <strong>{ev.staff}</strong> — pedido #{ev.orderCode} de @{ev.buyer} ({formatPrice(ev.total)})
                        </span>
                        <span className="ac-log-date">{new Date(ev.at).toLocaleString("pt-BR")}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
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
.ac-card{ background:#101722; border:1px solid rgba(96,165,250,0.14); border-radius:16px; padding:22px; }
.ac-btn{ display:inline-flex; align-items:center; gap:6px; border-radius:10px; border:1px solid transparent; font-weight:700; font-size:13.5px; padding:10px 18px; cursor:pointer; text-decoration:none; }
.ac-btn-primary{ background:linear-gradient(135deg,#3B82F6,#1D4ED8); color:#fff; }
.ac-log-list{ display:flex; flex-direction:column; gap:10px; margin:0; padding:0; list-style:none; }
.ac-log-item{ display:flex; flex-direction:column; gap:6px; background:rgba(255,255,255,0.03); border-radius:10px; padding:12px 14px; }
.ac-log-body{ display:flex; flex-direction:column; gap:2px; }
.ac-log-main{ font-size:13px; }
.ac-log-date{ font-size:11px; color:#8DA0BE; }
.ac-badge{ align-self:flex-start; font-size:11px; font-weight:700; padding:4px 10px; border-radius:999px; }
.ac-badge-on{ background:rgba(74,222,128,0.12); color:#4ADE80; border:1px solid rgba(74,222,128,0.3); }
.ac-badge-off-red{ background:rgba(248,113,113,0.12); color:#f87171; border:1px solid rgba(248,113,113,0.3); }
.ac-badge-blue{ background:rgba(96,165,250,0.12); color:#60A5FA; border:1px solid rgba(96,165,250,0.3); }
`;
