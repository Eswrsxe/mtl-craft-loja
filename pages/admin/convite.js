import { useState, useEffect, useCallback } from "react";

// /admin/convite — um admin já existente convida qualquer pessoa (pelo ID
// do Discord) pra também virar admin do SITE. A pessoa só precisa já ter
// logado com Discord no site alguma vez (senão não dá pra convidar ainda).
// Quem é convidado só ganha acesso depois de aceitar o convite, logada, em
// /admin/log — isso nunca dá cargo/permissão dentro do servidor do Discord.

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  let body = null;
  try {
    body = await res.json();
  } catch (_) {}
  if (!res.ok) throw { status: res.status, message: body?.error || `Erro (${res.status})` };
  return body;
}

function avatarUrl(discordId, avatarHash) {
  if (avatarHash) {
    const ext = String(avatarHash).startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${ext}?size=64`;
  }
  const index = Number((BigInt(discordId) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

const STATUS_META = {
  PENDING: { label: "Convite pendente", cls: "ap-badge-warn" },
  ACCEPTED: { label: "Admin (aceitou)", cls: "ac-badge-on" },
  DECLINED: { label: "Recusou o convite", cls: "ac-badge-off-red" },
};

export default function AdminConvite() {
  const [status, setStatus] = useState("loading"); // loading | denied | needsLogin | error | ready
  const [invites, setInvites] = useState([]);

  const [idInput, setIdInput] = useState("");
  const [lookup, setLookup] = useState(null); // { user, isFixedAdmin, grantStatus }
  const [lookupError, setLookupError] = useState("");
  const [lookingUp, setLookingUp] = useState(false);

  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteOk, setInviteOk] = useState("");

  const load = useCallback(() => {
    apiFetch("/api/admin/invites")
      .then((res) => {
        setInvites(res.invites);
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

  const doLookup = async (e) => {
    e?.preventDefault();
    setLookup(null);
    setLookupError("");
    setInviteError("");
    setInviteOk("");
    const id = idInput.trim();
    if (!/^\d{17,20}$/.test(id)) {
      setLookupError("Informe um ID do Discord válido (17 a 20 números).");
      return;
    }
    setLookingUp(true);
    try {
      const res = await apiFetch(`/api/admin/invites/lookup?discordId=${encodeURIComponent(id)}`);
      setLookup(res);
    } catch (err) {
      setLookupError(err.message);
    } finally {
      setLookingUp(false);
    }
  };

  const sendInvite = async () => {
    if (!lookup?.user) return;
    const ok = window.confirm(
      `Convidar ${lookup.user.username} (${lookup.user.discordId}) pra ser admin do site?\n\nEla vai ver o convite em /admin/log e pode aceitar ou recusar.`
    );
    if (!ok) return;
    setInviting(true);
    setInviteError("");
    setInviteOk("");
    try {
      await apiFetch("/api/admin/invites", { method: "POST", body: JSON.stringify({ discordId: lookup.user.discordId }) });
      setInviteOk(`Convite enviado pra ${lookup.user.username}.`);
      setLookup(null);
      setIdInput("");
      load();
    } catch (err) {
      setInviteError(err.message);
    } finally {
      setInviting(false);
    }
  };

  const revoke = async (invite) => {
    const isAccepted = invite.status === "ACCEPTED";
    const ok = window.confirm(
      isAccepted
        ? `Remover o acesso de admin de ${invite.user?.username || invite.discordId}?`
        : `Cancelar o convite pendente de ${invite.user?.username || invite.discordId}?`
    );
    if (!ok) return;
    try {
      await apiFetch(`/api/admin/invites/${invite.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      window.alert(err.message);
    }
  };

  return (
    <div className="ac-root">
      <style>{CSS}</style>
      <div className="ac-wrap">
        <div className="ac-topbar">
          <h1 className="ac-title">✉️ Convites de admin — MTL CRAFT</h1>
          <a className="ac-link" href="/admin/dashboard">Dashboard</a>
          <a className="ac-link" href="/admin/cupons">Cupons</a>
          <a className="ac-link" href="/admin/log">Log de ações</a>
          <a className="ac-link" href="/admin/pedido">Novo pedido</a>
        </div>

        {status === "loading" && <p className="ac-muted">Carregando...</p>}
        {status === "needsLogin" && (
          <div className="ac-card">
            <p>Você precisa entrar com sua conta do Discord pra acessar essa página.</p>
            <a className="ac-btn ac-btn-primary" href="/api/auth/discord/login">Entrar com Discord</a>
          </div>
        )}
        {status === "denied" && <div className="ac-card"><p>🔒 Acesso restrito à equipe.</p></div>}
        {status === "error" && <div className="ac-card"><p>Não foi possível carregar os convites. Tenta recarregar.</p></div>}

        {status === "ready" && (
          <>
            <div className="ac-card">
              <h2 className="ac-card-title">1. Convidar por ID do Discord</h2>
              <p className="ac-muted ac-small" style={{ marginBottom: 14 }}>
                A pessoa precisa já ter entrado no site com a conta do Discord pelo menos uma vez. Se ela
                ainda não tem conta, ela precisa logar primeiro — depois disso dá pra convidar.
              </p>
              <form className="ap-row" onSubmit={doLookup}>
                <input
                  className="ap-input"
                  value={idInput}
                  onChange={(e) => setIdInput(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="ID do Discord (ex: 123456789012345678)"
                  inputMode="numeric"
                />
                <button className="ac-btn ac-btn-outline" type="submit" disabled={lookingUp}>
                  {lookingUp ? "Buscando..." : "Buscar"}
                </button>
              </form>
              {lookupError && <p className="ac-error">{lookupError}</p>}
              {inviteOk && <p className="ac-ok">{inviteOk}</p>}

              {lookup?.user && (
                <div className="ap-member">
                  <img src={avatarUrl(lookup.user.discordId, lookup.user.avatar)} width={40} height={40} alt="" />
                  <div style={{ flex: 1 }}>
                    <div className="ap-member-name">{lookup.user.username}</div>
                    <div className="ac-small">{lookup.user.discordId}</div>
                  </div>

                  {lookup.isFixedAdmin ? (
                    <span className="ac-badge ac-badge-on">Já é admin fixo</span>
                  ) : lookup.grantStatus === "ACCEPTED" ? (
                    <span className="ac-badge ac-badge-on">Já é admin (convidado)</span>
                  ) : lookup.grantStatus === "PENDING" ? (
                    <span className="ac-badge ap-badge-warn">Convite já pendente</span>
                  ) : (
                    <button className="ac-btn ac-btn-primary" type="button" disabled={inviting} onClick={sendInvite}>
                      {inviting ? "Convidando..." : "Convidar para o admin"}
                    </button>
                  )}
                </div>
              )}
              {inviteError && <p className="ac-error">{inviteError}</p>}
            </div>

            <div className="ac-card">
              <h2 className="ac-card-title">2. Convites já feitos</h2>
              {invites.length === 0 ? (
                <p className="ac-muted">Nenhum convite feito ainda.</p>
              ) : (
                <ul className="ac-log-list">
                  {invites.map((inv) => {
                    const meta = STATUS_META[inv.status] || { label: inv.status, cls: "" };
                    return (
                      <li key={inv.id} className="ac-log-item">
                        <span className={`ac-badge ${meta.cls}`}>{meta.label}</span>
                        <div className="ac-log-body">
                          <span className="ac-log-main">
                            <strong>{inv.user?.username || "(sem conta)"}</strong> — {inv.discordId} · convidado por{" "}
                            {inv.invitedBy}
                          </span>
                          <span className="ac-log-date">
                            {new Date(inv.createdAt).toLocaleString("pt-BR")}
                            {inv.respondedAt ? ` · respondeu em ${new Date(inv.respondedAt).toLocaleString("pt-BR")}` : ""}
                          </span>
                        </div>
                        <button className="ac-btn ac-btn-danger ac-btn-xs" type="button" onClick={() => revoke(inv)}>
                          {inv.status === "ACCEPTED" ? "Remover acesso" : "Cancelar"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
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
.ac-small{ font-size:11.5px; color:#8DA0BE; }
.ac-card{ background:#101722; border:1px solid rgba(96,165,250,0.14); border-radius:16px; padding:22px; margin-bottom:20px; }
.ac-card-title{ font-size:16px; font-weight:800; margin:0 0 14px; }
.ac-error{ color:#FCA5A5; font-size:13px; margin:10px 0 0; }
.ac-ok{ color:#4ADE80; font-size:13px; margin:10px 0 0; }
.ac-btn{ display:inline-flex; align-items:center; justify-content:center; gap:6px; border-radius:10px; border:1px solid transparent; font-weight:700; font-size:13.5px; padding:10px 18px; cursor:pointer; text-decoration:none; }
.ac-btn:disabled{ opacity:0.5; cursor:not-allowed; }
.ac-btn-primary{ background:linear-gradient(135deg,#3B82F6,#1D4ED8); color:#fff; }
.ac-btn-outline{ background:transparent; color:#60A5FA; border-color:rgba(96,165,250,0.4); }
.ac-btn-danger{ background:transparent; color:#f87171; border-color:rgba(248,113,113,0.4); }
.ac-btn-xs{ padding:6px 10px; font-size:12px; }
.ap-row{ display:flex; flex-wrap:wrap; gap:12px; }
.ap-input{ flex:1; min-width:220px; background:rgba(255,255,255,0.03); border:1px solid rgba(96,165,250,0.14); border-radius:10px; padding:10px 12px; color:#fff; font-size:14px; outline:none; }
.ap-input:focus{ border-color:#3B82F6; }
.ap-member{ display:flex; align-items:center; gap:12px; margin-top:16px; flex-wrap:wrap; }
.ap-member img{ border-radius:50%; background:#0b1120; }
.ap-member-name{ font-weight:800; }
.ap-badge-warn{ background:rgba(250,204,21,0.12); color:#FACC15; border:1px solid rgba(250,204,21,0.3); }
.ac-badge{ font-size:11px; font-weight:700; padding:4px 10px; border-radius:999px; white-space:nowrap; }
.ac-badge-on{ background:rgba(74,222,128,0.12); color:#4ADE80; border:1px solid rgba(74,222,128,0.3); }
.ac-badge-off-red{ background:rgba(248,113,113,0.12); color:#f87171; border:1px solid rgba(248,113,113,0.3); }
.ac-log-list{ display:flex; flex-direction:column; gap:10px; margin:0; padding:0; list-style:none; }
.ac-log-item{ display:flex; align-items:center; flex-wrap:wrap; gap:10px; background:rgba(255,255,255,0.03); border-radius:10px; padding:12px 14px; }
.ac-log-body{ display:flex; flex-direction:column; gap:2px; flex:1; min-width:220px; }
.ac-log-main{ font-size:13px; }
.ac-log-date{ font-size:11px; color:#8DA0BE; }
`;
