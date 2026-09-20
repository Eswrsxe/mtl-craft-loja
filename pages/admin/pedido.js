import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// /admin/pedido — abre um pedido no NOME de outra pessoa (só admin).
// Escolhe a pessoa pelo ID do Discord, monta o carrinho com QUALQUER produto da
// loja (inclusive Kit Personalizado e Clã Oficial), aplica cupom e abre o pedido.
// O bot cria o ticket normalmente, mesmo que a pessoa já tenha outro aberto.

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

const CLAN_SLUG = "cla-oficial";
const CATEGORY_ORDER = ["kits", "pvp", "vip", "tags", "bases", "personalizado", "cla"];
const brl = (n) => `R$ ${Number(n).toFixed(2).replace(".", ",")}`;
const round2 = (n) => Math.round(n * 100) / 100;

function clanNameError(raw) {
  const value = String(raw || "").replace(/\s+/g, " ").trim();
  if (!value) return "Informe o Nome do Clã.";
  const length = Array.from(value).length;
  if (length < 2) return "O Nome do Clã precisa ter pelo menos 2 caracteres.";
  if (length > 32) return "O Nome do Clã pode ter no máximo 32 caracteres.";
  if (/[`\p{C}]/u.test(value)) return "O Nome do Clã contém caracteres não permitidos.";
  return "";
}

export default function AdminPedido() {
  const [status, setStatus] = useState("loading"); // loading | denied | needsLogin | error | ready
  const [products, setProducts] = useState([]);

  const [idInput, setIdInput] = useState("");
  const [member, setMember] = useState(null);
  const [memberError, setMemberError] = useState("");
  const [lookingUp, setLookingUp] = useState(false);

  const [cart, setCart] = useState([]); // [{ slug, qty }]
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [clanName, setClanName] = useState("");

  const [couponInput, setCouponInput] = useState("");
  const [appliedCode, setAppliedCode] = useState("");
  const [discount, setDiscount] = useState(0);
  const [couponError, setCouponError] = useState("");

  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState(null);
  const keyRef = useRef(null);

  useEffect(() => {
    apiFetch("/api/admin/products")
      .then((res) => {
        setProducts(res.products);
        setStatus("ready");
      })
      .catch((e) => {
        if (e.status === 401) setStatus("needsLogin");
        else if (e.status === 403) setStatus("denied");
        else setStatus("error");
      });
  }, []);

  const bySlug = useMemo(() => Object.fromEntries(products.map((p) => [p.slug, p])), [products]);

  const lines = cart
    .map((c) => ({ ...c, product: bySlug[c.slug] }))
    .filter((l) => l.product)
    .map((l) => ({ ...l, lineTotal: round2(l.product.price * l.qty) }));
  const subtotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));
  const total = round2(subtotal - discount);
  const hasClan = cart.some((c) => c.slug === CLAN_SLUG);
  const cartSignature = cart.map((c) => `${c.slug}:${c.qty}`).join(",");

  // Mudou pessoa/carrinho/cupom/nome do clã => é outro pedido, chave nova.
  useEffect(() => {
    keyRef.current = null;
  }, [member?.discordId, cartSignature, appliedCode, clanName]);

  // Reconfere o cupom no servidor sempre que o subtotal muda.
  useEffect(() => {
    if (!appliedCode) return;
    if (subtotal <= 0) {
      setDiscount(0);
      return;
    }
    let cancelled = false;
    apiFetch("/api/coupons/validate", { method: "POST", body: JSON.stringify({ code: appliedCode, subtotal }) })
      .then((res) => {
        if (cancelled) return;
        setDiscount(res.discountAmount);
        setCouponError("");
      })
      .catch((e) => {
        if (cancelled) return;
        setAppliedCode("");
        setDiscount(0);
        setCouponError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [appliedCode, subtotal]);

  const lookup = async (e) => {
    e?.preventDefault();
    setMember(null);
    setMemberError("");
    const id = idInput.trim();
    if (!/^\d{17,20}$/.test(id)) {
      setMemberError("Informe um ID do Discord válido (17 a 20 números).");
      return;
    }
    setLookingUp(true);
    try {
      const res = await apiFetch(`/api/admin/member?id=${encodeURIComponent(id)}`);
      setMember(res.member);
    } catch (err) {
      setMemberError(err.message);
    } finally {
      setLookingUp(false);
    }
  };

  const addProduct = (slug) => {
    setCart((prev) => {
      const found = prev.find((c) => c.slug === slug);
      if (found) return prev.map((c) => (c.slug === slug ? { ...c, qty: Math.min(99, c.qty + 1) } : c));
      return [...prev, { slug, qty: 1 }];
    });
  };
  const setQty = (slug, value) => {
    const qty = Math.min(99, Math.max(1, Number.parseInt(value, 10) || 1));
    setCart((prev) => prev.map((c) => (c.slug === slug ? { ...c, qty } : c)));
  };
  const removeProduct = (slug) => setCart((prev) => prev.filter((c) => c.slug !== slug));

  const applyCoupon = (e) => {
    e.preventDefault();
    const code = couponInput.trim().toUpperCase();
    setCouponError("");
    if (!code) return;
    if (subtotal <= 0) {
      setCouponError("Adicione itens ao carrinho antes de aplicar o cupom.");
      return;
    }
    setAppliedCode(code);
    setCouponInput("");
  };
  const removeCoupon = () => {
    setAppliedCode("");
    setDiscount(0);
    setCouponError("");
  };

  const cartError = (() => {
    if (cart.length === 0) return "Adicione pelo menos um item.";
    if (hasClan) {
      if (cart.length !== 1 || cart[0].qty !== 1) return "O Clã Oficial deve ser comprado sozinho, 1 unidade por pedido.";
      return clanNameError(clanName);
    }
    return "";
  })();
  const canSubmit = !!member && !cartError && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    const summary = lines.map((l) => `${l.qty}× ${l.product.name}`).join("\n");
    const ok = window.confirm(
      `Abrir pedido no nome de ${member.displayName} (${member.username})?\n\n${summary}\n\nTotal: ${brl(total)}`
    );
    if (!ok) return;

    setBusy(true);
    setSubmitError("");
    if (!keyRef.current) keyRef.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const res = await apiFetch("/api/admin/orders", {
        method: "POST",
        body: JSON.stringify({
          targetDiscordId: member.discordId,
          items: cart.map((c) => ({ productId: c.slug, quantity: c.qty })),
          couponCode: appliedCode || undefined,
          clanName: hasClan ? clanName : undefined,
          idempotencyKey: keyRef.current,
        }),
      });
      setResult(res);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setResult(null);
    setCart([]);
    setClanName("");
    removeCoupon();
    setSubmitError("");
    keyRef.current = null;
  };

  const categories = useMemo(() => {
    const seen = new Map();
    for (const p of products) if (!seen.has(p.categoryKey)) seen.set(p.categoryKey, p.categoryLabel);
    return [...seen.entries()].sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a[0]);
      const ib = CATEGORY_ORDER.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [products]);

  const visible = products.filter((p) => {
    if (category !== "all" && p.categoryKey !== category) return false;
    const q = search.trim().toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q);
  });

  return (
    <div className="ac-root">
      <style>{CSS}</style>
      <div className="ac-wrap">
        <div className="ac-topbar">
          <h1 className="ac-title">🧾 Novo pedido para um membro — MTL CRAFT</h1>
          <a className="ac-link" href="/admin/dashboard">Dashboard</a>
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
          <div className="ac-card">
            <p>🔒 Acesso restrito à equipe. Sua conta não está na lista de administradores.</p>
          </div>
        )}

        {status === "error" && (
          <div className="ac-card">
            <p>Não foi possível carregar a loja. Tenta recarregar a página.</p>
          </div>
        )}

        {status === "ready" && result && (
          <div className="ac-card ap-success">
            <h2 className="ac-card-title">✅ Pedido #{result.order.code} aberto</h2>
            <p>
              Em nome de <strong>{result.target.displayName}</strong> ({result.target.username}) — total{" "}
              <strong>{brl(result.order.total)}</strong>.
            </p>
            <p className="ac-muted">
              O bot abre o ticket no Discord em instantes, mesmo que essa pessoa já tenha outro atendimento aberto.
            </p>
            <button className="ac-btn ac-btn-primary" onClick={reset}>Abrir outro pedido</button>
          </div>
        )}

        {status === "ready" && !result && (
          <>
            <form className="ac-card" onSubmit={lookup}>
              <h2 className="ac-card-title">1. Quem é o comprador?</h2>
              <div className="ap-row">
                <input
                  className="ap-input"
                  value={idInput}
                  onChange={(e) => {
                    setIdInput(e.target.value);
                    setMember(null);
                    setMemberError("");
                  }}
                  placeholder="ID do Discord (ex.: 123456789012345678)"
                  inputMode="numeric"
                />
                <button className="ac-btn ac-btn-primary" type="submit" disabled={lookingUp}>
                  {lookingUp ? "Buscando..." : "Buscar"}
                </button>
              </div>
              {memberError && <p className="ac-error">{memberError}</p>}
              {member && (
                <div className="ap-member">
                  <img src={member.avatarUrl} alt="" width="44" height="44" />
                  <div>
                    <div className="ap-member-name">{member.displayName}</div>
                    <div className="ac-small">
                      {member.username} · {member.discordId}
                    </div>
                  </div>
                  <span className={`ac-badge ${member.verified ? "ac-badge-on" : "ap-badge-warn"}`}>
                    {member.verified ? "No servidor" : "Não confirmado no servidor"}
                  </span>
                </div>
              )}
            </form>

            <div className="ac-card">
              <h2 className="ac-card-title">2. Itens</h2>
              <div className="ap-row">
                <input
                  className="ap-input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar item..."
                />
                <select className="ap-input ap-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="all">Todas as categorias</option>
                  {categories.map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="ap-catalog">
                {visible.length === 0 && <p className="ac-muted">Nenhum item encontrado.</p>}
                {visible.map((p) => {
                  const inCart = cart.find((c) => c.slug === p.slug);
                  return (
                    <div className="ap-item" key={p.slug}>
                      <div>
                        <div className="ap-item-name">{p.name}</div>
                        <div className="ac-small">{p.categoryLabel}</div>
                      </div>
                      <div className="ap-item-right">
                        <span className="ac-mono">{brl(p.price)}</span>
                        <button className="ac-btn ac-btn-outline ac-btn-xs" type="button" onClick={() => addProduct(p.slug)}>
                          {inCart ? `+1 (${inCart.qty})` : "Adicionar"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="ac-card">
              <h2 className="ac-card-title">3. Carrinho</h2>
              {lines.length === 0 && <p className="ac-muted">Nenhum item ainda.</p>}
              {lines.map((l) => (
                <div className="ap-item" key={l.slug}>
                  <div>
                    <div className="ap-item-name">{l.product.name}</div>
                    <div className="ac-small">{brl(l.product.price)} cada</div>
                  </div>
                  <div className="ap-item-right">
                    <input
                      className="ap-input ap-qty"
                      type="number"
                      min="1"
                      max="99"
                      value={l.qty}
                      onChange={(e) => setQty(l.slug, e.target.value)}
                      aria-label={`Quantidade de ${l.product.name}`}
                    />
                    <span className="ac-mono ap-line-total">{brl(l.lineTotal)}</span>
                    <button className="ac-btn ac-btn-danger ac-btn-xs" type="button" onClick={() => removeProduct(l.slug)}>
                      Remover
                    </button>
                  </div>
                </div>
              ))}

              {hasClan && (
                <label className="ap-field">
                  Nome do Clã
                  <input
                    className="ap-input"
                    value={clanName}
                    onChange={(e) => setClanName(e.target.value)}
                    placeholder="Nome do clã (2 a 32 caracteres)"
                    maxLength={40}
                  />
                </label>
              )}

              <form className="ap-coupon" onSubmit={applyCoupon}>
                <input
                  className="ap-input"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="Cupom (opcional)"
                  disabled={!!appliedCode}
                />
                {appliedCode ? (
                  <button className="ac-btn ac-btn-outline" type="button" onClick={removeCoupon}>
                    Remover {appliedCode}
                  </button>
                ) : (
                  <button className="ac-btn ac-btn-outline" type="submit">Aplicar</button>
                )}
              </form>
              {couponError && <p className="ac-error">{couponError}</p>}

              <div className="ap-totals">
                <div><span>Subtotal</span><span className="ac-mono">{brl(subtotal)}</span></div>
                {discount > 0 && (
                  <div><span>Cupom {appliedCode}</span><span className="ac-mono">− {brl(discount)}</span></div>
                )}
                <div className="ap-total"><span>Total</span><span className="ac-mono">{brl(total)}</span></div>
              </div>

              {cart.length > 0 && cartError && <p className="ac-error">{cartError}</p>}
              {submitError && <p className="ac-error">{submitError}</p>}

              <button className="ac-btn ac-btn-primary ap-submit" type="button" disabled={!canSubmit} onClick={submit}>
                {busy ? "Abrindo pedido..." : member ? `Abrir pedido para ${member.displayName}` : "Escolha o comprador primeiro"}
              </button>
              <p className="ac-small ap-note">
                Não há trava de “1 atendimento por vez” aqui: o pedido é aberto mesmo que a pessoa já tenha outro ticket.
              </p>
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
.ac-error{ color:#FCA5A5; font-size:13px; margin:10px 0 0; }
.ac-btn{
  display:inline-flex; align-items:center; justify-content:center; gap:6px;
  border-radius:10px; border:1px solid transparent; font-weight:700; font-size:13.5px;
  padding:10px 18px; cursor:pointer; text-decoration:none;
}
.ac-btn:disabled{ opacity:0.5; cursor:not-allowed; }
.ac-btn-primary{ background:linear-gradient(135deg,#3B82F6,#1D4ED8); color:#fff; }
.ac-btn-outline{ background:transparent; color:#60A5FA; border-color:rgba(96,165,250,0.4); }
.ac-btn-danger{ background:transparent; color:#f87171; border-color:rgba(248,113,113,0.4); }
.ac-btn-xs{ padding:6px 10px; font-size:12px; }
.ac-mono{ font-family:'JetBrains Mono', monospace; font-weight:700; }
.ac-small{ font-size:11.5px; color:#8DA0BE; }
.ac-badge{ font-size:11px; font-weight:700; padding:3px 9px; border-radius:999px; white-space:nowrap; }
.ac-badge-on{ background:rgba(74,222,128,0.12); color:#4ADE80; border:1px solid rgba(74,222,128,0.3); }
.ap-badge-warn{ background:rgba(250,204,21,0.12); color:#FACC15; border:1px solid rgba(250,204,21,0.3); }
.ap-row{ display:flex; flex-wrap:wrap; gap:12px; }
.ap-input{
  flex:1; min-width:180px; background:rgba(255,255,255,0.03); border:1px solid rgba(96,165,250,0.14);
  border-radius:10px; padding:10px 12px; color:#fff; font-size:14px; outline:none;
}
.ap-input:focus{ border-color:#3B82F6; }
.ap-select{ flex:0 0 220px; }
.ap-qty{ flex:0 0 72px; min-width:72px; padding:6px 8px; text-align:center; }
.ap-member{ display:flex; align-items:center; gap:12px; margin-top:16px; flex-wrap:wrap; }
.ap-member img{ border-radius:50%; background:#0b1120; }
.ap-member-name{ font-weight:800; }
.ap-catalog{ margin-top:14px; max-height:340px; overflow-y:auto; border-top:1px solid rgba(255,255,255,0.05); }
.ap-item{
  display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;
  padding:10px 4px; border-bottom:1px solid rgba(255,255,255,0.05);
}
.ap-item-name{ font-weight:700; font-size:14px; }
.ap-item-right{ display:flex; align-items:center; gap:10px; }
.ap-line-total{ min-width:80px; text-align:right; }
.ap-field{ display:flex; flex-direction:column; gap:6px; font-size:12.5px; color:#8DA0BE; margin-top:16px; }
.ap-coupon{ display:flex; gap:12px; margin-top:16px; flex-wrap:wrap; }
.ap-totals{ margin-top:18px; border-top:1px solid rgba(255,255,255,0.08); padding-top:12px; }
.ap-totals > div{ display:flex; justify-content:space-between; padding:4px 0; font-size:14px; color:#C7D2E6; }
.ap-total{ font-size:18px !important; font-weight:800; color:#fff !important; }
.ap-submit{ width:100%; margin-top:16px; padding:14px 18px; }
.ap-note{ margin:10px 0 0; }
.ap-success p{ margin:0 0 12px; }
`;