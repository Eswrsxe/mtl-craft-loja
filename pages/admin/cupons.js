import { useState, useEffect, useCallback } from "react";

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

const EMPTY_FORM = {
  code: "",
  discountType: "PERCENT",
  discountValue: "",
  maxUses: "",
  validFrom: "",
  validUntil: "",
};

export default function AdminCoupons() {
  const [status, setStatus] = useState("loading"); // loading | denied | needsLogin | ready
  const [coupons, setCoupons] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiFetch("/api/admin/coupons")
      .then((res) => {
        setCoupons(res.coupons);
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

  const submit = async (e) => {
    e.preventDefault();
    setFormError("");
    setBusy(true);
    try {
      await apiFetch("/api/admin/coupons", {
        method: "POST",
        body: JSON.stringify({
          code: form.code,
          discountType: form.discountType,
          discountValue: Number(form.discountValue),
          maxUses: form.maxUses === "" ? null : Number(form.maxUses),
          validFrom: form.validFrom || null,
          validUntil: form.validUntil || null,
        }),
      });
      setForm(EMPTY_FORM);
      load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (coupon) => {
    await apiFetch(`/api/admin/coupons/${coupon.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !coupon.active }),
    }).catch(() => {});
    load();
  };

  const removeCoupon = async (coupon) => {
    if (!confirm(`Apagar o cupom ${coupon.code}? Isso não pode ser desfeito.`)) return;
    await apiFetch(`/api/admin/coupons/${coupon.id}`, { method: "DELETE" }).catch(() => {});
    load();
  };

  return (
    <div className="ac-root">
      <style>{CSS}</style>
      <div className="ac-wrap">
        <div className="ac-topbar">
          <h1 className="ac-title">🏷️ Cupons — MTL CRAFT</h1>
          <a className="ac-link" href="/admin/dashboard">Dashboard</a>
          <a className="ac-link" href="/admin/log">Log de ações</a>
        </div>

        {status === "loading" && <p className="ac-muted">Carregando...</p>}

        {status === "needsLogin" && (
          <div className="ac-card">
            <p>Você precisa entrar com sua conta do Discord pra acessar essa página.</p>
            <a className="ac-btn ac-btn-primary" href="/api/auth/discord/login">
              Entrar com Discord
            </a>
          </div>
        )}

        {status === "denied" && (
          <div className="ac-card">
            <p>🔒 Acesso restrito à equipe. Sua conta não está na lista de administradores.</p>
          </div>
        )}

        {status === "error" && (
          <div className="ac-card">
            <p>Não foi possível carregar os cupons. Tenta recarregar a página.</p>
          </div>
        )}

        {status === "ready" && (
          <>
            <form className="ac-card ac-form" onSubmit={submit}>
              <h2 className="ac-card-title">Novo cupom</h2>
              <div className="ac-form-row">
                <label>
                  Código
                  <input
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    placeholder="BEMVINDO10"
                    required
                  />
                </label>
                <label>
                  Tipo
                  <select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })}>
                    <option value="PERCENT">Percentual (%)</option>
                    <option value="FIXED">Valor fixo (R$)</option>
                  </select>
                </label>
                <label>
                  Valor
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.discountValue}
                    onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                    placeholder={form.discountType === "PERCENT" ? "10" : "5.00"}
                    required
                  />
                </label>
              </div>
              <div className="ac-form-row">
                <label>
                  Limite de usos (opcional)
                  <input
                    type="number"
                    min="1"
                    value={form.maxUses}
                    onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                    placeholder="Sem limite"
                  />
                </label>
                <label>
                  Válido a partir de (opcional)
                  <input type="datetime-local" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
                </label>
                <label>
                  Válido até (opcional)
                  <input type="datetime-local" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
                </label>
              </div>
              {formError && <p className="ac-error">{formError}</p>}
              <button className="ac-btn ac-btn-primary" type="submit" disabled={busy}>
                {busy ? "Criando..." : "Criar cupom"}
              </button>
            </form>

            <div className="ac-card">
              <h2 className="ac-card-title">Cupons existentes</h2>
              {coupons.length === 0 && <p className="ac-muted">Nenhum cupom criado ainda.</p>}
              {coupons.length > 0 && (
                <div className="ac-table-wrap">
                  <table className="ac-table">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Desconto</th>
                        <th>Usos</th>
                        <th>Validade</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {coupons.map((c) => (
                        <tr key={c.id} className={!c.active ? "ac-row-inactive" : ""}>
                          <td className="ac-mono">{c.code}</td>
                          <td>{c.discountType === "PERCENT" ? `${c.discountValue}%` : `R$ ${Number(c.discountValue).toFixed(2)}`}</td>
                          <td>
                            {c.usedCount}
                            {c.maxUses !== null ? ` / ${c.maxUses}` : ""}
                          </td>
                          <td className="ac-small">
                            {c.validFrom ? new Date(c.validFrom).toLocaleDateString("pt-BR") : "—"}
                            {" até "}
                            {c.validUntil ? new Date(c.validUntil).toLocaleDateString("pt-BR") : "—"}
                          </td>
                          <td>
                            <span className={`ac-badge ${c.active ? "ac-badge-on" : "ac-badge-off"}`}>
                              {c.active ? "Ativo" : "Inativo"}
                            </span>
                          </td>
                          <td className="ac-actions">
                            <button className="ac-btn ac-btn-outline ac-btn-xs" onClick={() => toggleActive(c)}>
                              {c.active ? "Desativar" : "Ativar"}
                            </button>
                            <button className="ac-btn ac-btn-danger ac-btn-xs" onClick={() => removeCoupon(c)}>
                              Apagar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const CSS = `
.ac-root{
  min-height:100vh; background:#05070A; color:#fff;
  font-family:'Inter', system-ui, sans-serif; padding:32px 16px;
}
.ac-wrap{ max-width:900px; margin:0 auto; }
.ac-topbar{ display:flex; align-items:center; flex-wrap:wrap; gap:16px; margin-bottom:24px; }
.ac-title{ font-size:24px; font-weight:800; margin:0; }
.ac-link{ color:#60A5FA; font-size:13px; font-weight:700; text-decoration:none; }
.ac-link:hover{ text-decoration:underline; }
.ac-muted{ color:#8DA0BE; }
.ac-card{
  background:#101722; border:1px solid rgba(96,165,250,0.14); border-radius:16px;
  padding:22px; margin-bottom:20px;
}
.ac-card-title{ font-size:16px; font-weight:800; margin:0 0 16px; }
.ac-form-row{ display:flex; flex-wrap:wrap; gap:14px; margin-bottom:14px; }
.ac-form-row label{ display:flex; flex-direction:column; gap:6px; font-size:12.5px; color:#8DA0BE; flex:1; min-width:150px; }
.ac-form-row input, .ac-form-row select{
  background:rgba(255,255,255,0.03); border:1px solid rgba(96,165,250,0.14); border-radius:10px;
  padding:10px 12px; color:#fff; font-size:14px; outline:none;
}
.ac-form-row input:focus, .ac-form-row select:focus{ border-color:#3B82F6; }
.ac-error{ color:#FCA5A5; font-size:13px; margin:0 0 12px; }
.ac-btn{
  display:inline-flex; align-items:center; justify-content:center; gap:6px;
  border-radius:10px; border:1px solid transparent; font-weight:700; font-size:13.5px;
  padding:10px 18px; cursor:pointer; text-decoration:none;
}
.ac-btn-primary{ background:linear-gradient(135deg,#3B82F6,#1D4ED8); color:#fff; }
.ac-btn-outline{ background:transparent; color:#60A5FA; border-color:rgba(96,165,250,0.4); }
.ac-btn-danger{ background:transparent; color:#f87171; border-color:rgba(248,113,113,0.4); }
.ac-btn-xs{ padding:6px 10px; font-size:12px; }
.ac-table-wrap{ overflow-x:auto; }
.ac-table{ width:100%; border-collapse:collapse; font-size:13px; }
.ac-table th{ text-align:left; color:#8DA0BE; font-size:11.5px; text-transform:uppercase; padding:8px 10px; border-bottom:1px solid rgba(96,165,250,0.14); }
.ac-table td{ padding:10px; border-bottom:1px solid rgba(255,255,255,0.05); vertical-align:middle; }
.ac-row-inactive{ opacity:0.5; }
.ac-mono{ font-family:'JetBrains Mono', monospace; font-weight:700; }
.ac-small{ font-size:11.5px; color:#8DA0BE; white-space:nowrap; }
.ac-badge{ font-size:11px; font-weight:700; padding:3px 9px; border-radius:999px; }
.ac-badge-on{ background:rgba(74,222,128,0.12); color:#4ADE80; border:1px solid rgba(74,222,128,0.3); }
.ac-badge-off{ background:rgba(255,255,255,0.06); color:#8DA0BE; border:1px solid rgba(255,255,255,0.1); }
.ac-actions{ display:flex; gap:6px; white-space:nowrap; }
`;
