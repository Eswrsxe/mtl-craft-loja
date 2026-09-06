import React, { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } from "react";
import {
  Menu, X, Search, ShoppingCart, Sword, Flame, Crown, Wrench, Tag as TagIcon,
  Home as HomeIcon, MapPin, CreditCard, Plus, Minus, Trash2, Copy, Check,
  ChevronRight, ChevronDown, Star, Sparkles, Shield, ExternalLink, ArrowRight,
  Gem, Boxes, Zap, User as UserIcon, LogOut, Fingerprint, Loader2, Package,
  AlertTriangle
} from "lucide-react";
// AUTENTICAÇÃO — WebAuthn (Passkey) no navegador.
// Biblioteca oficial, faz todo o diálogo nativo do SO (impressão digital,
// Face ID, PIN do Windows Hello etc). Nenhuma biometria passa pelo nosso
// código ou pelo servidor — apenas o resultado assinado do desafio.
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";

/* =========================================================================
   MTL CRAFT — Catálogo Oficial
   -------------------------------------------------------------------------
   Arquivo único (pronto para artifact / preview). A estrutura lógica abaixo
   está organizada em blocos comentados que espelham o que, num projeto
   Next.js real, seriam arquivos separados:

     data/products.js       -> seção "DADOS" mais abaixo
     components/Navbar.jsx  -> <Navbar />
     components/Hero.jsx    -> <Hero />
     sections/*.jsx         -> <CategoriesSection />, <FeaturedSection />,
                                <CatalogSection />, <KitsSection />,
                                <PvpSection />, <VipSection />,
                                <CustomKitSection />, <TagSection />,
                                <BasesSection />, <CoordSection />,
                                <PaymentSection />
     components/Footer.jsx  -> <Footer />
     components/ProductCard, BuyModal, Reveal, Counter -> componentes
     reutilizáveis

   Onde editar (procure por "EDITAR AQUI"):
     - Link do Discord ......... const DISCORD_LINK
     - Chave PIX / titular ...... const PIX_KEY / PIX_HOLDER
     - Logo ..................... componente <Logo />
     - Imagens dos kits/bases ... campo "image" dentro de cada produto
   ========================================================================= */

/* ------------------------------ CONFIG --------------------------------- */

// EDITAR AQUI: troque pelo link real do servidor de Discord do MTL CRAFT
const DISCORD_LINK = "https://discord.gg/JJCeSGnS4M";

// EDITAR AQUI: pasta onde ficam as imagens (logo + kits + bases).
// Crie uma pasta "images" ao lado do site (ou "public/images" no Next.js) e
// jogue todos os arquivos da sua pasta SIELA lá dentro, soltos, exatamente
// com esses nomes — não precisa renomear nada.
// Ex.: /images/iconServer.png, /images/KitClava.png, /images/KitGod+Compl1-e-2.png ...
const IMG_BASE = "/images";
// Aceita tanto um nome de arquivo simples (ex.: "KitPot.png", que vai para
// /images/KitPot.png) quanto um caminho já com pasta (ex.: "images2/CLA.jpg",
// usado pelos kits novos cujas imagens ficam em /public/images2).
const imgUrl = (filename) => {
  if (!filename) return null;
  if (filename.startsWith("/") || filename.includes("/")) {
    return filename.startsWith("/") ? filename : `/${filename}`;
  }
  return `${IMG_BASE}/${filename}`;
};

// EDITAR AQUI: chave PIX oficial
const PIX_KEY = "viola@gmail.com";
const PIX_HOLDER = "Viola";

function formatPrice(n) {
  if (n === null || n === undefined) {
    return "Sob consulta";
  }

  const value = Number(n);

  if (!Number.isFinite(value)) {
    return "Sob consulta";
  }

  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

/* ============================================================================
   AUTENTICAÇÃO (Discord OAuth2 + Passkey/WebAuthn)
   ----------------------------------------------------------------------------
   Tudo isso é NOVO em relação ao site original. Não altera catálogo, layout
   ou CSS — apenas adiciona login/conta/checkout real por cima do que já
   existia. As chamadas abaixo batem nas API Routes criadas em pages/api/*.
   ============================================================================ */

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    /* resposta sem corpo (ex.: 204) */
  }
  if (!res.ok) {
    const message = body?.error || `Erro (${res.status})`;
    throw new Error(message);
  }
  return body;
}

const AuthContext = createContext(null);

function useAuthCtx() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthCtx precisa estar dentro de <AuthProvider>");
  return ctx;
}

// Salva/recupera uma compra pendente que precisa sobreviver ao redirecionamento
// de ida-e-volta para o Discord (login via OAuth2 é navegação de página cheia).
const PENDING_PURCHASE_KEY = "mtl_pending_purchase";
function savePendingPurchase(modalData) {
  try {
    sessionStorage.setItem(PENDING_PURCHASE_KEY, JSON.stringify(modalData));
  } catch (_) {}
}
function loadPendingPurchase() {
  try {
    const raw = sessionStorage.getItem(PENDING_PURCHASE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}
function clearPendingPurchase() {
  try {
    sessionStorage.removeItem(PENDING_PURCHASE_KEY);
  } catch (_) {}
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = carregando, null = deslogado
  const [firstLoginPending, setFirstLoginPending] = useState(false);

  // Espelha "user" de forma síncrona para uso dentro de refresh(), sem
  // precisar recriar o callback a cada mudança de estado.
  const userRef = useRef(undefined);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Só fica true no instante em que o usuário volta do Discord (?authed=1).
  // É o único momento em que faz sentido considerar mostrar o cadastro de
  // Passkey — a decisão final, porém, é sempre baseada no estado real do
  // usuário (tem Passkey cadastrada?), nunca só nessa flag.
  const justLoggedInRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch("/api/auth/me");

      if (data.authError) {
        // Falha temporária do servidor/banco (ex.: Neon indisponível por um
        // instante). Isso NÃO significa que o usuário saiu — mantém o que já
        // sabíamos em vez de derrubar a sessão silenciosamente.
        return userRef.current === undefined ? null : userRef.current;
      }

      const nextUser = data.user || null;
      setUser(nextUser);
      userRef.current = nextUser;

      if (nextUser && justLoggedInRef.current) {
        justLoggedInRef.current = false;
        // Regra real: só pede Passkey se o usuário realmente ainda não tem
        // nenhuma cadastrada — não depende de uma query string que pode
        // estar incorreta/desatualizada.
        if (!nextUser.hasPasskey) setFirstLoginPending(true);
      }

      return nextUser;
    } catch (_) {
      // Erro real de rede ao chamar /api/auth/me (não é o caso de
      // "usuário deslogado", que a rota sempre responde com 200 + user:null).
      // Só assume deslogado se ainda não tínhamos nenhuma informação.
      if (userRef.current === undefined) {
        setUser(null);
        userRef.current = null;
      }
      return userRef.current;
    }
  }, []);

  useEffect(() => {
    const handleAuthReturn = async () => {
      const params = new URLSearchParams(window.location.search);
      const authed = params.get("authed");

      if (authed === "1") {
        justLoggedInRef.current = true;

        params.delete("authed");
        params.delete("first");

        const rest = params.toString();

        window.history.replaceState(
          {},
          "",
          window.location.pathname + (rest ? `?${rest}` : "")
        );
      }

      await refresh();
    };

    handleAuthReturn();
  }, [refresh]);

  const loginWithDiscord = useCallback((pendingModalData) => {
    if (pendingModalData) savePendingPurchase(pendingModalData);
    window.location.href = "/api/auth/discord/login";
  }, []);

  const loginWithPasskey = useCallback(async () => {
    const options = await apiFetch("/api/webauthn/login-options", { method: "POST" });
    const assertion = await startAuthentication(options);
    await apiFetch("/api/webauthn/login-verify", {
      method: "POST",
      body: JSON.stringify(assertion),
    });
    return refresh();
  }, [refresh]);

  const registerPasskey = useCallback(async () => {
    const options = await apiFetch("/api/webauthn/register-options", { method: "POST" });
    const attestation = await startRegistration(options);
    await apiFetch("/api/webauthn/register-verify", {
      method: "POST",
      body: JSON.stringify(attestation),
    });
    return refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    userRef.current = null;
    setFirstLoginPending(false);
  }, []);

  const value = {
    user,
    loading: user === undefined,
    firstLoginPending,
    clearFirstLoginPending: () => setFirstLoginPending(false),
    refresh,
    loginWithDiscord,
    loginWithPasskey,
    registerPasskey,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* ============================================================================
   CARRINHO
   ----------------------------------------------------------------------------
   Guarda itens de produtos DIFERENTES pra comprar tudo numa única compra. O
   backend (/api/orders) já aceita uma lista de {productId, quantity} de
   qualquer combinação de produtos — isso já era usado pelo Kit Personalizado,
   então o carrinho só precisa montar essa mesma lista.
   ============================================================================ */

const CartContext = createContext(null);

function useCartCtx() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCartCtx precisa estar dentro de <CartProvider>");
  return ctx;
}

const CART_STORAGE_KEY = "mtl_cart_v1";

function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function CartProvider({ children }) {
  const [items, setItems] = useState([]); // [{ id, name, price, image, category, qty }]
  const [open, setOpen] = useState(false);

  // Carrega do localStorage só depois de montar (evita mismatch SSR/CSR).
  useEffect(() => {
    setItems(loadCartFromStorage());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch (_) {}
  }, [items]);

  const addItem = useCallback((product, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) => (i.id === product.id ? { ...i, qty: i.qty + qty } : i));
      }
      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          price: product.price,
          image: product.image,
          images: product.images,
          category: product.category,
          qty,
        },
      ];
    });
  }, []);

  const removeItem = useCallback((productId) => {
    setItems((prev) => prev.filter((i) => i.id !== productId));
  }, []);

  const setQty = useCallback((productId, qty) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((i) => i.id !== productId)
        : prev.map((i) => (i.id === productId ? { ...i, qty } : i))
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const count = items.reduce((acc, i) => acc + i.qty, 0);
  const total = items.reduce((acc, i) => acc + i.price * i.qty, 0);

  const value = { items, addItem, removeItem, setQty, clear, count, total, open, setOpen };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/* ------------------------------- DADOS ---------------------------------- */

const CATEGORY_META = {
  kits:         { label: "Kits",             icon: Sword,    anchor: "#kits" },
  pvp:          { label: "Kit PVP",          icon: Flame,    anchor: "#kits" },
  vip:          { label: "VIP",              icon: Crown,    anchor: "#vip" },
  personalizado:{ label: "Personalizados",   icon: Wrench,   anchor: "#personalizado" },
  tags:         { label: "Tags",             icon: TagIcon,  anchor: "#tags" },
  bases:        { label: "Bases",            icon: HomeIcon, anchor: "#bases" },
  coord:        { label: "Coord Express",    icon: MapPin,   anchor: "#coord" },
};

const kitsPadrao = [
  { id: "kp-perolas", name: "KIT PÉROLAS",   price: 1.50, desc: "Pacote de pérolas do End para mobilidade em combate.", image: "KitPerolas.png" },
  { id: "kp-forca2",  name: "KIT FORÇA II",  price: 1.25, desc: "Poções de Força II para aumentar seu dano em batalha.", image: "KitForça.png" },
  { id: "kp-speed2",  name: "KIT SPEED II",  price: 1.00, desc: "Poções de Velocidade II para se mover mais rápido pelo mapa.", image: "KitSpeed.png" },
  { id: "kp-totem",   name: "KIT TOTEM",     price: 3.50, desc: "Totens de Undying para garantir uma segunda chance.", image: "Kittotem.png" },
  { id: "kp-elytra",  name: "KIT ELYTRA",    price: 4.00, desc: "Elytra pronta para voar por todo o mapa.", image: "KitElytrla.png" },
  { id: "kp-pot",     name: "KIT POT",       price: 4.50, desc: "Conjunto de poções essenciais para o PVP.", image: "KitPot.png" },
  { id: "kp-clava",   name: "KIT CLAVA",     price: 4.50, desc: "Clava encantada para combates corpo a corpo.", image: "KitClava.png" },
  // EDITAR AQUI: não encontrei um arquivo "KitMortal.png" na sua pasta — deixei
  // apontando para "KitImortal.png" (o nome mais parecido). Troque se não for o certo.
  { id: "kp-mortal",  name: "KIT MORTAL",    price: 3.50, desc: "Itens letais para eliminar seus inimigos com eficiência.", image: "KitImortal.png" },
  { id: "kp-farm",    name: "KIT FARM",      price: 6.50, desc: "Ferramentas e insumos para turbinar sua farm.", image: "KitFarm.png" },
];

const kitsPvp = [
  { id: "pv-nether",     name: "KIT NETHER",     price: 7.00,  desc: "Equipamento essencial para expedições no Nether.", image: "KitNether.png" },
  { id: "pv-netherop",   name: "KIT NETHER OP",  price: 10.00, desc: "Versão reforçada do Kit Nether, com mais recursos.", image: "KitNetherOP.png" },
  { id: "pv-subnether",  name: "KIT SUB NETHER", price: 12.00, desc: "Kit avançado para quem domina o submundo.", image: "KitSubNether.png" },
  { id: "pv-cristal",    name: "KIT CRISTAL",    price: 9.00,  desc: "Cristais do End prontos para combate ofensivo.", image: "KitCristal.png" },
  { id: "pv-pvp",        name: "KIT PVP",        price: 11.00, desc: "Kit completo montado para duelos competitivos.", image: "KitPVP.png" },
  { id: "pv-guerreiro",  name: "KIT GUERREIRO",  price: 18.00, desc: "Armadura e armamento de guerreiro experiente.", images: ["KitGuerreiro.jpg", "KitGuerreiroComp1.jpg"] },
  { id: "pv-duo",        name: "KIT DUO",        price: 14.00, desc: "Preparado para batalhas em dupla.", image: "KitDuo.png" },
  { id: "pv-god",        name: "KIT GOD",        price: 25.00, desc: "O topo absoluto dos kits PVP do MTL CRAFT.", featured: true, images: ["KitGod.jpg", "KitGodComp1.jpg", "KitGodComp2.jpg"] },
  // Kits novos — imagens em /public/images2. Os marcados com "EDITAR AQUI"
  // não bateram com certeza numa foto da sua pasta (a screenshot que você
  // mandou estava cortada); confira o nome do arquivo e ajuste se precisar.
  { id: "pv-reidosares", name: "KIT REI DOS ARES",      price: 15.00, desc: "Domine os ares com um kit lendário, digno de um rei.", images: ["images2/KitAres.jpg", "images2/KitAres2.png"] },
  // EDITAR AQUI: não encontrei um arquivo óbvio pra "RAID BASE" — troque pelo nome certo em /public/images2.
  { id: "pv-raidbase",   name: "KIT RAID BASE",         price: 5.00,  desc: "Kit completo para invadir e destruir bases inimigas.", image: "images2/KitRaidBase.jpg" },
  // EDITAR AQUI: usei "KitEnd.jpg" tanto aqui quanto no KIT END abaixo — confirme se são fotos diferentes.
  { id: "pv-reiend",     name: "KIT REI END",           price: 20.00, desc: "Poder supremo para dominar as terras do End.", image: "images2/KitEnd.jpg" },
  { id: "pv-reidomar",   name: "KIT REI DO MAR",        price: 20.00, desc: "Equipamento aquático de um verdadeiro rei dos mares.", images: ["images2/ReiDoMar.jpg", "images2/ReiDoMarComp1.jpg"] },
  { id: "pv-reinether",  name: "KIT REI NETHER",        price: 23.00, desc: "O topo do poder para reinar sobre o Nether.", images: ["images2/ReiDoNether.jpg", "images2/ReiDoNetherComp1.jpg"] },
  // EDITAR AQUI: não encontrei um arquivo óbvio pra "MINERADOR" — troque pelo nome certo em /public/images2.
  { id: "pv-minerador",  name: "KIT MINERADOR",         price: 5.00,  desc: "Ferramentas turbinadas para minerar com máxima eficiência.", image: "images2/KitMinerador.jpg" },
  { id: "pv-infernal",   name: "KIT INFERNAL",          price: 10.00, desc: "Armamento das profundezas para quem não teme o fogo.", image: "images2/KitInfernal.jpg" },
  { id: "pv-end",        name: "KIT END",                price: 8.00,  desc: "Itens essenciais para expedições e combates no End.", image: "images2/KitEnd.jpg" },
  // EDITAR AQUI: chutei "KitRed.jpg" pra REDSTONE (também note que você escreveu "RESDSTONE" — confirme se não é erro de digitação de "REDSTONE").
  { id: "pv-redstone",   name: "KIT RESDSTONE",         price: 4.00,  desc: "Componentes de redstone para construções e mecanismos.", image: "images2/KitRed.jpg" },
  { id: "pv-armo",       name: "KIT ARMO",              price: 35.00, desc: "Armadura reforçada para máxima proteção em combate.", image: "images2/KitArmo.jpg" },
  { id: "pv-cla",        name: "KIT CLÃ",               price: 30.00, desc: "Kit exclusivo para o seu clã dominar o servidor.", image: "images2/CLA.jpg" },
  { id: "pv-mestresmagia", name: "KIT MESTRES DA MAGIA", price: 8.00,  desc: "Itens mágicos para os verdadeiros mestres da arcania.", image: "images2/KitMagia.jpg" },
  { id: "pv-pvpdima",    name: "KIT PVP DIMA",          price: 5.00,  desc: "Kit PVP badalado, pronto pra guerra.", image: "images2/PVPDima.jpg" },
  // EDITAR AQUI: chutei "KitSemiDeus.jpg" pra "KIT DEUS" — confirme se é essa a foto certa ou se existe uma "KitDeus.jpg" separada.
  { id: "pv-deus",       name: "KIT DEUS",              price: 12.00, desc: "Poder absoluto — o kit dos deuses do MTL CRAFT.", image: "images2/KitSemiDeus.jpg" },
];

const vipPlans = [
  { id: "vip-semanal", name: "VIP SEMANAL", price: 5.00,  period: "Semanal" },
  { id: "vip-mensal",  name: "VIP MENSAL",  price: 15.00, period: "Mensal", popular: true, featured: true },
];

const vipBenefits = [
  { icon: TagIcon,  text: "TAG VIP exclusiva" },
  { icon: Boxes,    text: "KIT VIP" },
  { icon: Gem,      text: "10% de desconto em qualquer compra" },
  { icon: Sparkles, text: "+4 TAGS grátis para o seu clã" },
  { icon: MapPin,   text: "Acesso a kits escondidos pelo mapa" },
];

const customItems = [
  { id: "ci-unbandez",       name: "1 Unban",           price: 10.00 },
  { id: "ci-unbantrinta",       name: "2 Unban",           price: 30.00 },
  { id: "ci-unbancinquenta",       name: "3 Unban",           price: 50.00 },
  { id: "ci-full",       name: "Qualquer item full",           price: 0.75 },
  { id: "ci-macadour",   name: "Pack de Maçã Dourada",          price: 0.50 },
  { id: "ci-moldeatual", name: "Molde de Atualização",          price: 0.50 },
  { id: "ci-cristalend", name: "Pack de Cristal do End",        price: 1.00 },
  { id: "ci-elytra",     name: "Elytra",                        price: 0.50 },
  { id: "ci-elytraenc",  name: "Elytra Encantada",               price: 0.75 },
  { id: "ci-tnt",        name: "Pack de TNT",                    price: 0.50 },
  { id: "ci-obsidiana",  name: "Pack de Obsidiana",               price: 0.75 },
  { id: "ci-teia",       name: "Pack de Teia",                   price: 0.25 },
  { id: "ci-moldes",     name: "Moldes Normais",                 price: 0.25 },
  { id: "ci-fungos",     name: "10 Fungos",                      price: 0.50 },
  { id: "ci-cascos",     name: "16 Cascos de Shulker",            price: 0.75 },
  { id: "ci-livroenc",   name: "Livro Encantado",                 price: 0.10 },
  { id: "ci-fogos",      name: "Pack de Fogos",                   price: 0.10 },
  { id: "ci-spawner",    name: "Spawner",                         price: 0.25 },
  { id: "ci-ovosnorm",   name: "Ovos Normais",                    price: 0.25 },
  { id: "ci-ovosop",     name: "Ovos OP",                          price: 0.35 },
  { id: "ci-frascosxp",  name: "Pack de Frascos de XP",            price: 0.10 },
  { id: "ci-netherite",  name: "Barra de Netherite",               price: 0.50 },
  { id: "ci-totem",      name: "Totem",                            price: 0.10 },
  { id: "ci-macaenc",    name: "Maçã Encantada (unidade)",          price: 0.10 },
  { id: "ci-pocao",      name: "Qualquer Poção",                    price: 0.05 },
  { id: "ci-blocos",     name: "Pack de Blocos de Construção",       price: 0.35 },
];

const tagPlans = [
  { id: "tag-semanal", name: "TAG SEMANAL", price: 1.00, period: "Semanal" },
  { id: "tag-mensal",  name: "TAG MENSAL",  price: 3.50, period: "Mensal" },
];

const bases = [
  { id: "base-basica", name: "BASE BÁSICA", price: 30.00, stock: 3, desc: "Base inicial pronta para uso, ideal para começar com segurança." },
  { id: "base-op",     name: "BASE OP",     price: 50.00, stock: 1, desc: "Base avançada, totalmente equipada e otimizada.", featured: true },
];

const coordPricing = [
  { world: "Overworld", icon: "🌎", rate: "R$ 0,50 a cada 10.000 blocos" },
  { world: "Nether",    icon: "🔥", rate: "R$ 1,00 a cada 20.000 blocos" },
  { world: "The End",   icon: "🐉", rate: "R$ 1,00 a cada 20.000 blocos" },
];

// Catálogo unificado usado pela busca / filtros / destaque
const catalogProducts = [
  ...kitsPadrao.map((p) => ({ ...p, category: "kits", buyable: true })),
  ...kitsPvp.map((p) => ({ ...p, category: "pvp", buyable: true })),
  ...vipPlans.map((p) => ({
    ...p,
    category: "vip",
    desc: `Plano ${p.period.toLowerCase()} com benefícios exclusivos do servidor.`,
    buyable: true,
  })),
  ...tagPlans.map((p) => ({
    ...p,
    category: "tags",
    desc: "Tag personalizada válida no Discord e dentro do servidor.",
    buyable: true,
  })),
  ...bases.map((p) => ({ ...p, category: "bases", buyable: true })),
  {
    id: "personalizado-card",
    name: "KIT PERSONALIZADO",
    category: "personalizado",
    price: null,
    desc: "Monte seu próprio kit escolhendo os itens item a item.",
    buyable: false,
    featured: true,
  },
  {
    id: "coord-card",
    name: "COORD EXPRESS",
    category: "coord",
    price: null,
    desc: "Teleporte com um STAFF até a coordenada que você escolher.",
    buyable: false,
  },
];

const featuredProducts = catalogProducts.filter((p) => p.featured);

/* ------------------------------ HELPERS --------------------------------- */

function useReveal() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.unobserve(el);
        }
      },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, visible];
}

function Reveal({ children, delay = 0, className = "" }) {
  const [ref, visible] = useReveal();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s cubic-bezier(.16,.84,.44,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

function useCountUpVisible() {
  return useReveal();
}

/* ------------------------------ UI ATOMS --------------------------------- */

// Imagem com fallback automático: se o arquivo ainda não existir na pasta
// /images, mostra o ícone no lugar em vez de quebrar o layout.
function ImageWithFallback({ src, alt, fallback, className, imgStyle }) {
  const [error, setError] = useState(false);
  useEffect(() => setError(false), [src]);
  if (!src || error) return fallback;
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={imgStyle}
      onError={() => setError(true)}
      loading="lazy"
    />
  );
}

// Alguns kits têm "complementos" (mesma compra, mais itens na shulker) e a
// gente mostra isso ciclando as fotos automaticamente: base -> complemento(s)
// -> volta pra base, em loop. Produtos comuns só passam 1 imagem em `images`
// (ou usam o campo `image` de sempre) e não ciclam nada.
function CyclingProductImage({ images, alt, className, fallback }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    if (!images || images.length <= 1) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, 2600);
    return () => clearInterval(id);
  }, [images]);

  const src = images && images.length > 0 ? imgUrl(images[index]) : null;

  return (
    <ImageWithFallback
      key={index}
      src={src}
      alt={alt}
      className={`${className} mc-card-image-cycling`}
      fallback={fallback}
    />
  );
}

function Logo({ size = 34 }) {
  return (
    <div className="mc-logo">
      <div className="mc-logo-mark" style={{ width: size, height: size }}>
        <ImageWithFallback
          src={imgUrl("iconServer.png")}
          alt="MTL CRAFT"
          imgStyle={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 9 }}
          fallback={<Boxes size={size * 0.58} color="#0B0F14" strokeWidth={2.4} />}
        />
      </div>
      <span className="mc-logo-text">
        MTL<span className="mc-logo-accent">CRAFT</span>
      </span>
    </div>
  );
}

function CategoryBadge({ category }) {
  const meta = CATEGORY_META[category];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span className="mc-badge">
      <Icon size={12} />
      {meta.label}
    </span>
  );
}

function Counter({ value, onChange, min = 1, max = 99 }) {
  return (
    <div className="mc-counter">
      <button
        aria-label="Diminuir quantidade"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="mc-counter-btn"
      >
        <Minus size={14} />
      </button>
      <span className="mc-counter-val">{value}</span>
      <button
        aria-label="Aumentar quantidade"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="mc-counter-btn"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

/* ------------------------------ NAVBAR ------------------------------------ */

const NAV_LINKS = [
  { label: "Início", href: "#inicio" },
  { label: "Kits", href: "#kits" },
  { label: "VIP", href: "#vip" },
  { label: "Kits Personalizados", href: "#personalizado" },
  { label: "Tags", href: "#tags" },
  { label: "Bases", href: "#bases" },
  { label: "Coord Express", href: "#coord" },
  { label: "Pagamento", href: "#pagamento" },
];

function AccountButton({ size = "sm" }) {
  const { user, loading, loginWithDiscord } = useAuthCtx();
  const [accountOpen, setAccountOpen] = useState(false);

  if (loading) {
    return (
      <button className={`mc-btn mc-btn-outline mc-btn-${size}`} disabled>
        <Loader2 size={15} className="mc-spin" />
      </button>
    );
  }

  if (!user) {
    return (
      <button className={`mc-btn mc-btn-outline mc-btn-${size}`} onClick={() => loginWithDiscord()}>
        <UserIcon size={15} /> Entrar
      </button>
    );
  }

  return (
    <>
      <button className={`mc-btn mc-btn-outline mc-btn-${size}`} onClick={() => setAccountOpen(true)}>
        <UserIcon size={15} /> {user.username}
      </button>
      {accountOpen && <AccountPanel onClose={() => setAccountOpen(false)} />}
    </>
  );
}

function CartButton({ size = "sm" }) {
  const cart = useCartCtx();
  return (
    <button
      className={`mc-btn mc-btn-outline mc-btn-${size} mc-cart-btn`}
      onClick={() => cart.setOpen(true)}
      aria-label="Abrir carrinho"
    >
      <ShoppingCart size={15} />
      {size === "block" && "Carrinho"}
      {cart.count > 0 && <span className="mc-cart-badge">{cart.count}</span>}
    </button>
  );
}

function Navbar({ onBuyClick }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const go = (href) => {
    setOpen(false);
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <header className={`mc-nav ${scrolled ? "mc-nav-scrolled" : ""}`}>
      <div className="mc-nav-inner">
        <button className="mc-nav-logo-btn" onClick={() => go("#inicio")}>
          <Logo />
        </button>

        <nav className="mc-nav-links">
          {NAV_LINKS.map((l) => (
            <button key={l.href} className="mc-nav-link" onClick={() => go(l.href)}>
              {l.label}
            </button>
          ))}
        </nav>

        <div className="mc-nav-actions">
          <CartButton size="sm" />
          <AccountButton size="sm" />
          <button className="mc-btn mc-btn-primary mc-btn-sm" onClick={() => go("#catalogo")}>
            <ShoppingCart size={15} />
            Comprar agora
          </button>
          <button
            className="mc-nav-burger"
            aria-label="Abrir menu"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      <div className={`mc-nav-mobile ${open ? "mc-nav-mobile-open" : ""}`}>
        {NAV_LINKS.map((l) => (
          <button key={l.href} className="mc-nav-mobile-link" onClick={() => go(l.href)}>
            {l.label}
            <ChevronRight size={16} />
          </button>
        ))}
        <button
          className="mc-btn mc-btn-primary mc-btn-block"
          onClick={() => go("#catalogo")}
        >
          <ShoppingCart size={16} />
          Comprar agora
        </button>
        <div className="mc-nav-mobile-account">
          <CartButton size="block" />
          <AccountButton size="block" />
        </div>
      </div>
    </header>
  );
}

/* ------------------------------ HERO --------------------------------------- */

function Particles({ count = 22 }) {
  const particles = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 3 + Math.random() * 5,
        duration: 10 + Math.random() * 14,
        delay: Math.random() * 10,
        opacity: 0.15 + Math.random() * 0.35,
      })),
    [count]
  );
  return (
    <div className="mc-particles" aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.id}
          className="mc-particle"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function Hero({ onGoCatalog, onGoVip }) {
  return (
    <section id="inicio" className="mc-hero">
      <div className="mc-hero-grid" aria-hidden="true" />
      <Particles />
      <div className="mc-hero-glow" aria-hidden="true" />

      <div className="mc-hero-content">
        <Reveal>
          <span className="mc-eyebrow">
            <Zap size={13} /> Loja oficial do servidor
          </span>
        </Reveal>
        <Reveal delay={80}>
          <h1 className="mc-hero-title">
            MTL <span className="mc-hero-title-accent">CRAFT</span>
          </h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="mc-hero-subtitle">Seu servidor. Seus itens. Sua experiência.</p>
        </Reveal>
        <Reveal delay={240}>
          <p className="mc-hero-text">
            Confira nosso catálogo oficial de kits, VIP, itens personalizados, bases e
            outros produtos exclusivos do MTL CRAFT.
          </p>
        </Reveal>
        <Reveal delay={320}>
          <div className="mc-hero-actions">
            <button className="mc-btn mc-btn-primary mc-btn-lg" onClick={onGoCatalog}>
              Ver catálogo <ArrowRight size={17} />
            </button>
            <button className="mc-btn mc-btn-ghost mc-btn-lg" onClick={onGoVip}>
              <Crown size={17} /> Conhecer VIP
            </button>
          </div>
        </Reveal>
      </div>

      <div className="mc-hero-fade" aria-hidden="true" />
    </section>
  );
}

/* ------------------------------ CATEGORIAS ---------------------------------- */

function CategoriesSection({ onSelect }) {
  const items = [
    { key: "kits", label: "Kits", emoji: "⚔️" },
    { key: "vip", label: "VIP", emoji: "💎" },
    { key: "personalizado", label: "Kit Personalizado", emoji: "🛠️" },
    { key: "tags", label: "Tag Personalizada", emoji: "🏷️" },
    { key: "bases", label: "Bases à Venda", emoji: "🏠" },
    { key: "coord", label: "Coord Express", emoji: "📍" },
  ];
  return (
    <section className="mc-section">
      <Reveal>
        <h2 className="mc-section-title">Categorias</h2>
        <p className="mc-section-sub">Explore tudo o que o MTL CRAFT tem para você.</p>
      </Reveal>
      <div className="mc-cat-grid">
        {items.map((it, i) => (
          <Reveal delay={i * 60} key={it.key}>
            <button className="mc-cat-card" onClick={() => onSelect(it.key)}>
              <span className="mc-cat-emoji">{it.emoji}</span>
              <span className="mc-cat-label">{it.label}</span>
              <ChevronRight className="mc-cat-arrow" size={16} />
            </button>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ PRODUCT CARD -------------------------------- */

function StarRow({ value, size = 14 }) {
  return (
    <span className="mc-stars" aria-label={`${value} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} className={n <= Math.round(value) ? "mc-star-filled" : "mc-star-empty"} />
      ))}
    </span>
  );
}

// Busca as avaliações reais desse produto (nunca inventadas — só existem se
// alguém realmente comprou, recebeu o kit e avaliou pelo Discord).
function ProductReviews({ slug }) {
  const [data, setData] = useState(undefined); // undefined = carregando
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setData(undefined);
    setError("");
    fetch(`/api/products/${slug}/reviews`)
      .then((r) => r.json())
      .then((res) => {
        if (active) setData(res);
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar as avaliações.");
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (error) return <p className="mc-modal-desc">{error}</p>;
  if (data === undefined) return <p className="mc-modal-desc">Carregando avaliações...</p>;
  if (!data.count) return <p className="mc-modal-desc">Ainda não há avaliações para este kit.</p>;

  return (
    <div className="mc-reviews">
      <div className="mc-reviews-summary">
        <div className="mc-reviews-summary-item">
          <span className="mc-reviews-summary-label">Atendimento</span>
          <StarRow value={data.avgService} />
          <span className="mc-reviews-summary-value">{data.avgService.toFixed(1)}</span>
        </div>
        <div className="mc-reviews-summary-item">
          <span className="mc-reviews-summary-label">Kit</span>
          <StarRow value={data.avgKit} />
          <span className="mc-reviews-summary-value">{data.avgKit.toFixed(1)}</span>
        </div>
        <p className="mc-reviews-count">
          {data.count} avaliaç{data.count === 1 ? "ão" : "ões"}
        </p>
      </div>

      <ul className="mc-reviews-list">
        {data.reviews.map((r) => (
          <li key={r.id} className="mc-review-item">
            <div className="mc-review-head">
              <span className="mc-review-username">@{r.username}</span>
              <span className="mc-review-badge">🛒 Compra verificada</span>
            </div>
            <div className="mc-review-stars-row">
              <span>Atendimento <StarRow value={r.serviceStars} size={12} /></span>
              <span>Kit <StarRow value={r.kitStars} size={12} /></span>
            </div>
            {r.comment && <p className="mc-review-comment">{r.comment}</p>}
            <p className="mc-review-date">{new Date(r.createdAt).toLocaleDateString("pt-BR")}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProductCard({ product, onBuy, featuredStyle = false, index = 0 }) {
  const meta = CATEGORY_META[product.category];
  const Icon = meta?.icon ?? Sword;

  return (
    <Reveal delay={(index % 6) * 60}>
      <div className={`mc-card ${featuredStyle ? "mc-card-featured" : ""}`}>
        {product.featured && (
          <span className="mc-card-ribbon">
            <Star size={11} /> Destaque
          </span>
        )}

        <div className="mc-card-image">
          {product.images && product.images.length > 1 ? (
            <CyclingProductImage
              images={product.images}
              alt={product.name}
              className="mc-card-image-img"
              fallback={
                <div className="mc-card-image-fallback">
                  <Icon size={30} />
                </div>
              }
            />
          ) : (
            <ImageWithFallback
              src={imgUrl(product.image || (product.images && product.images[0]))}
              alt={product.name}
              className="mc-card-image-img"
              fallback={
                <div className="mc-card-image-fallback">
                  <Icon size={30} />
                </div>
              }
            />
          )}
        </div>

        <div className="mc-card-top">
          <div className="mc-card-icon">
            <Icon size={22} />
          </div>
          <CategoryBadge category={product.category} />
        </div>

        <h3 className="mc-card-name">{product.name}</h3>
        <p className="mc-card-desc">{product.desc}</p>

        {product.stock !== undefined && (
          <p className="mc-card-stock">
            Estoque: <strong>{product.stock} {product.stock === 1 ? "unidade" : "unidades"}</strong>
          </p>
        )}

        <div className="mc-card-bottom">
          <span className="mc-card-price">{formatPrice(product.price)}</span>
          <div className="mc-card-actions">
            {product.buyable ? (
              <>
                <button className="mc-btn mc-btn-outline mc-btn-xs" onClick={() => onBuy(product, "detail")}>
                  Ver detalhes
                </button>
                <button className="mc-btn mc-btn-primary mc-btn-xs" onClick={() => onBuy(product, "buy")}>
                  Comprar
                </button>
              </>
            ) : (
              <button
                className="mc-btn mc-btn-primary mc-btn-xs mc-btn-block"
                onClick={() => {
                  const el = document.querySelector(meta.anchor);
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                Acessar seção <ArrowRight size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </Reveal>
  );
}

/* ------------------------------ FEATURED ------------------------------------ */

function FeaturedSection({ onBuy }) {
  return (
    <section className="mc-section">
      <Reveal>
        <h2 className="mc-section-title">
          <Star size={20} className="mc-title-icon" /> Produtos em destaque
        </h2>
        <p className="mc-section-sub">Os itens mais desejados do servidor.</p>
      </Reveal>
      <div className="mc-grid mc-grid-4">
        {featuredProducts.map((p, i) => (
          <ProductCard key={p.id} product={p} onBuy={onBuy} featuredStyle index={i} />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ CATALOGO (busca/filtro) --------------------- */

const FILTERS = [
  { key: "todos", label: "Todos" },
  { key: "kits", label: "Kits" },
  { key: "pvp", label: "Kit PVP" },
  { key: "vip", label: "VIP" },
  { key: "personalizado", label: "Personalizados" },
  { key: "tags", label: "Tags" },
  { key: "bases", label: "Bases" },
  { key: "coord", label: "Coord Express" },
];

function CatalogSection({ onBuy }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("todos");
  const [sort, setSort] = useState("relevancia");

  const results = useMemo(() => {
    let list = catalogProducts.filter((p) =>
      p.name.toLowerCase().includes(query.trim().toLowerCase())
    );
    if (filter !== "todos") list = list.filter((p) => p.category === filter);

    if (sort === "menor") {
      list = [...list].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    } else if (sort === "maior") {
      list = [...list].sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
    } else if (sort === "nome") {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [query, filter, sort]);

  return (
    <section id="catalogo" className="mc-section">
      <Reveal>
        <h2 className="mc-section-title">Catálogo completo</h2>
        <p className="mc-section-sub">Pesquise, filtre e encontre exatamente o que precisa.</p>
      </Reveal>

      <Reveal delay={80}>
        <div className="mc-search-bar">
          <div className="mc-search-input-wrap">
            <Search size={17} className="mc-search-icon" />
            <input
              className="mc-search-input"
              placeholder="Pesquisar produto..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select className="mc-select" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="relevancia">Ordenar por relevância</option>
            <option value="menor">Menor preço</option>
            <option value="maior">Maior preço</option>
            <option value="nome">Nome (A-Z)</option>
          </select>
        </div>

        <div className="mc-filter-row">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`mc-filter-chip ${filter === f.key ? "mc-filter-chip-active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Reveal>

      {results.length === 0 ? (
        <p className="mc-empty">Nenhum produto encontrado para essa busca.</p>
      ) : (
        <div className="mc-grid mc-grid-4">
          {results.map((p, i) => (
            <ProductCard key={p.id} product={p} onBuy={onBuy} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------ KITS / PVP ----------------------------------- */

function KitsSection({ onBuy }) {
  return (
    <section id="kits" className="mc-section">
      <Reveal>
        <h2 className="mc-section-title">
          <Sword size={20} className="mc-title-icon" /> Kit Padrão
        </h2>
        <p className="mc-section-sub">Itens essenciais para o seu dia a dia no servidor.</p>
      </Reveal>
      <div className="mc-grid mc-grid-3">
        {kitsPadrao.map((p, i) => (
          <ProductCard key={p.id} product={{ ...p, category: "kits", buyable: true }} onBuy={onBuy} index={i} />
        ))}
      </div>

      <Reveal>
        <h2 className="mc-section-title mc-section-title-spaced">
          <Flame size={20} className="mc-title-icon" /> Kit PVP
        </h2>
        <p className="mc-section-sub">Equipamentos avançados para dominar os combates.</p>
      </Reveal>
      <div className="mc-grid mc-grid-3">
        {kitsPvp.map((p, i) => (
          <ProductCard key={p.id} product={{ ...p, category: "pvp", buyable: true }} onBuy={onBuy} featuredStyle={!!p.featured} index={i} />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ VIP -------------------------------------------- */

function VipSection({ onBuy }) {
  return (
    <section id="vip" className="mc-section mc-section-alt">
      <Reveal>
        <h2 className="mc-section-title">
          <Crown size={20} className="mc-title-icon" /> VIP
        </h2>
        <p className="mc-section-sub">
          Adquira o plano VIP e desbloqueie benefícios exclusivos para tornar sua
          experiência ainda mais completa.
        </p>
      </Reveal>

      <div className="mc-vip-grid">
        {vipPlans.map((plan, i) => (
          <Reveal delay={i * 100} key={plan.id}>
            <div className={`mc-vip-card ${plan.popular ? "mc-vip-card-popular" : ""}`}>
              {plan.popular && <span className="mc-vip-tag">MAIS POPULAR</span>}
              <p className="mc-vip-period">{plan.period}</p>
              <p className="mc-vip-price">{formatPrice(plan.price)}</p>
              <ul className="mc-vip-benefits">
                {vipBenefits.map((b, idx) => (
                  <li key={idx}>
                    <b.icon size={15} />
                    {b.text}
                  </li>
                ))}
              </ul>
              <button
                className="mc-btn mc-btn-primary mc-btn-block"
                onClick={() => onBuy({ ...plan, category: "vip", desc: `Plano ${plan.period.toLowerCase()} do VIP MTL CRAFT.`, buyable: true }, "buy")}
              >
                Assinar {plan.period}
              </button>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal>
        <div className="mc-note-box">
          <p>Os benefícios podem ser alterados a qualquer momento.</p>
          <p>Em caso de dúvidas, entre em contato com o suporte.</p>
        </div>
      </Reveal>
    </section>
  );
}

/* ------------------------------ KIT PERSONALIZADO ------------------------------ */

function CustomKitSection({ openTicket }) {
  const [qty, setQty] = useState({});

  const setItemQty = (id, value) => {
    setQty((prev) => {
      const next = { ...prev };
      if (value <= 0) delete next[id];
      else next[id] = value;
      return next;
    });
  };

  const selectedList = useMemo(
    () =>
      Object.entries(qty)
        .map(([id, q]) => {
          const item = customItems.find((i) => i.id === id);
          return item ? { ...item, qty: q } : null;
        })
        .filter(Boolean),
    [qty]
  );

  const total = selectedList.reduce((acc, i) => acc + i.price * i.qty, 0);

  return (
    <section id="personalizado" className="mc-section">
      <Reveal>
        <h2 className="mc-section-title">
          <Wrench size={20} className="mc-title-icon" /> Monte seu próprio Kit
        </h2>
        <p className="mc-section-sub">
          Escolha entre uma variedade de itens para montar o kit perfeito do seu jeito.
        </p>
        <p className="mc-inline-note">
          Todos os itens devem caber em uma Shulker Box de sua escolha.
        </p>
      </Reveal>

      <div className="mc-builder">
        <Reveal className="mc-builder-list-wrap">
          <div className="mc-builder-list">
            {customItems.map((item) => {
              const current = qty[item.id] || 0;
              return (
                <div key={item.id} className={`mc-builder-row ${current > 0 ? "mc-builder-row-active" : ""}`}>
                  <div className="mc-builder-row-info">
                    <span className="mc-builder-row-name">{item.name}</span>
                    <span className="mc-builder-row-price">{formatPrice(item.price)}</span>
                  </div>
                  <Counter value={current || 0} min={0} onChange={(v) => setItemQty(item.id, v)} />
                </div>
              );
            })}
          </div>
        </Reveal>

        <Reveal delay={100} className="mc-builder-summary-wrap">
          <div className="mc-builder-summary">
            <h3 className="mc-builder-summary-title">Resumo do kit</h3>
            {selectedList.length === 0 ? (
              <p className="mc-empty mc-empty-small">Nenhum item selecionado ainda.</p>
            ) : (
              <ul className="mc-builder-summary-list">
                {selectedList.map((i) => (
                  <li key={i.id}>
                    <span>
                      {i.qty}× {i.name}
                    </span>
                    <span className="mc-builder-summary-item-total">
                      {formatPrice(i.price * i.qty)}
                    </span>
                    <button
                      aria-label={`Remover ${i.name}`}
                      className="mc-builder-remove"
                      onClick={() => setItemQty(i.id, 0)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mc-builder-total-row">
              <span>Total do kit</span>
              <span className="mc-builder-total-value">{formatPrice(total)}</span>
            </div>

            <div className="mc-builder-summary-actions">
              <button
                className="mc-btn mc-btn-outline mc-btn-sm"
                onClick={() => setQty({})}
                disabled={selectedList.length === 0}
              >
                Limpar kit
              </button>
              <button
                className="mc-btn mc-btn-primary mc-btn-sm"
                disabled={selectedList.length === 0}
                onClick={() =>
                  openTicket({
                    type: "kit",
                    title: "Kit Personalizado",
                    items: selectedList,
                    total,
                  })
                }
              >
                Solicitar Kit
              </button>
            </div>

            <p className="mc-inline-note mc-inline-note-tight">
              Após montar seu kit, entre em contato com a equipe de suporte.
            </p>
            <p className="mc-inline-note mc-inline-note-tight">
              O valor final será calculado de acordo com os itens escolhidos.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------ TAG PERSONALIZADA ------------------------------ */

function TagSection({ onBuy }) {
  return (
    <section id="tags" className="mc-section mc-section-alt">
      <Reveal>
        <h2 className="mc-section-title">
          <TagIcon size={20} className="mc-title-icon" /> Tag Personalizada
        </h2>
        <p className="mc-section-sub">
          Este canal é destinado à venda de tags personalizadas, válidas tanto no
          Discord quanto dentro do servidor.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <div className="mc-tag-card">
          <p className="mc-tag-desc">
            A tag é uma forma de se destacar, demonstrando sua identidade, sem conceder
            qualquer vantagem, permissão ou cargo especial.
          </p>

          <div className="mc-tag-includes">
            <h4>Inclui:</h4>
            <ul>
              <li><Check size={14} /> Tag personalizada no Discord</li>
              <li><Check size={14} /> Tag visível dentro do servidor</li>
              <li><Check size={14} /> Uso liberado durante todo o período contratado</li>
            </ul>
          </div>

          <div className="mc-tag-plans">
            {tagPlans.map((t) => (
              <div key={t.id} className="mc-tag-plan">
                <span className="mc-tag-plan-period">{t.period}</span>
                <span className="mc-tag-plan-price">{formatPrice(t.price)}</span>
                <button
                  className="mc-btn mc-btn-primary mc-btn-xs"
                  onClick={() =>
                    onBuy(
                      { ...t, category: "tags", desc: "Tag personalizada válida no Discord e no servidor.", buyable: true },
                      "buy"
                    )
                  }
                >
                  Comprar
                </button>
              </div>
            ))}
          </div>

          <div className="mc-tag-rules">
            <h4>Regras</h4>
            <ul>
              <li>É proibido utilizar nomes que simulem cargos, como: dono, adm, staff, mod, sub-dono, entre outros.</li>
              <li>É proibido utilizar ofensas, palavrões, termos tóxicos ou qualquer conteúdo inapropriado.</li>
              <li>A tag será removida automaticamente ao fim do período contratado.</li>
              <li>A administração reserva-se o direito de recusar ou solicitar alterações em tags que não estejam de acordo com as regras.</li>
            </ul>
          </div>

          <p className="mc-inline-note">
            A tag é apenas estética e de identificação. Não concede vantagens, poderes
            ou permissões administrativas.
          </p>
        </div>
      </Reveal>
    </section>
  );
}

/* ------------------------------ BASES ------------------------------------------- */

function BasesSection({ onBuy }) {
  return (
    <section id="bases" className="mc-section">
      <Reveal>
        <h2 className="mc-section-title">
          <HomeIcon size={20} className="mc-title-icon" /> Bases à Venda
        </h2>
        <p className="mc-section-sub">Bases oficiais do MTL CRAFT disponíveis para compra.</p>
      </Reveal>

      <div className="mc-grid mc-grid-2">
        {bases.map((b, i) => (
          <ProductCard key={b.id} product={{ ...b, category: "bases", buyable: true }} onBuy={onBuy} featuredStyle={!!b.featured} index={i} />
        ))}
      </div>

      <div className="mc-info-cols">
        <Reveal className="mc-info-col">
          <h4>Como funciona</h4>
          <ul className="mc-check-list">
            <li><ChevronRight size={14} /> Escolha a base disponível.</li>
            <li><ChevronRight size={14} /> Confira as informações e o valor.</li>
            <li><ChevronRight size={14} /> Abra um ticket para realizar a compra.</li>
            <li><ChevronRight size={14} /> Aguarde a equipe realizar a entrega da base.</li>
          </ul>
        </Reveal>
        <Reveal delay={80} className="mc-info-col">
          <h4>Avisos</h4>
          <ul className="mc-check-list">
            <li><Shield size={14} /> Após a entrega da base, não será realizado reembolso.</li>
            <li><Shield size={14} /> Após a entrega, o MTL CRAFT não se responsabiliza por raids, invasões, roubos ou destruição da base.</li>
            <li><Shield size={14} /> As bases são vendidas exclusivamente pela equipe do MTL CRAFT.</li>
            <li><Shield size={14} /> Em caso de dúvida, abra um ticket antes de realizar qualquer pagamento.</li>
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------ COORD EXPRESS ------------------------------------ */

function CoordSection() {
  return (
    <section id="coord" className="mc-section mc-section-alt">
      <Reveal>
        <h2 className="mc-section-title">
          <MapPin size={20} className="mc-title-icon" /> Coord Express
        </h2>
        <p className="mc-section-sub">
          O serviço permite que um STAFF realize o seu teleporte para uma coordenada
          específica (X, Y, Z).
        </p>
      </Reveal>

      <div className="mc-coord-grid">
        <Reveal className="mc-coord-steps">
          <h4>Como solicitar</h4>
          <ol>
            <li>Envie as coordenadas (X, Y, Z).</li>
            <li>Informe o mundo: Overworld, Nether ou The End.</li>
            <li>Aguarde um STAFF.</li>
            <li>Realize o pagamento.</li>
            <li>O teleporte será realizado após a confirmação.</li>
          </ol>
        </Reveal>

        <Reveal delay={80} className="mc-coord-prices">
          <h4>Valores</h4>
          {coordPricing.map((c) => (
            <div key={c.world} className="mc-coord-price-row">
              <span className="mc-coord-emoji">{c.icon}</span>
              <div>
                <p className="mc-coord-world">{c.world}</p>
                <p className="mc-coord-rate">{c.rate}</p>
              </div>
            </div>
          ))}
        </Reveal>
      </div>

      <Reveal delay={140}>
        <div className="mc-note-box">
          <p>O pagamento deve ser realizado antes do teleporte.</p>
          <p>Confirme as coordenadas antes de enviá-las.</p>
          <p>Não há reembolso após o teleporte.</p>
          <p>Qualquer tentativa de golpe resultará em punição.</p>
          <p className="mc-inline-note">Leve apenas os itens essenciais para evitar perdas.</p>
        </div>
      </Reveal>
    </section>
  );
}

/* ------------------------------ PAGAMENTO ------------------------------------------ */

function PaymentSection() {
  const [copied, setCopied] = useState(false);

  const copyPix = async () => {
    try {
      await navigator.clipboard.writeText(PIX_KEY);
    } catch (e) {
      /* clipboard indisponível — segue sem travar a UI */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <section id="pagamento" className="mc-section">
      <Reveal>
        <h2 className="mc-section-title">
          <CreditCard size={20} className="mc-title-icon" /> Pagamento via PIX
        </h2>
        <p className="mc-section-sub">Forma de pagamento oficial do MTL CRAFT.</p>
      </Reveal>

      <Reveal delay={80}>
        <div className="mc-pix-card">
          <div className="mc-pix-row">
            <span className="mc-pix-label">Chave PIX</span>
            <span className="mc-pix-value">{PIX_KEY}</span>
          </div>
          <div className="mc-pix-row">
            <span className="mc-pix-label">Titular</span>
            <span className="mc-pix-value">{PIX_HOLDER}</span>
          </div>

          <button className={`mc-btn ${copied ? "mc-btn-success" : "mc-btn-primary"} mc-btn-block mc-btn-lg`} onClick={copyPix}>
            {copied ? <Check size={17} /> : <Copy size={17} />}
            {copied ? "Chave PIX copiada!" : "Copiar chave PIX"}
          </button>

          <div className="mc-note-box mc-note-box-tight">
            <p>Confirme os dados antes do pagamento.</p>
            <p>Envie o comprovante no canal de atendimento.</p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ------------------------------ MODAL (compra / ticket) ----------------------------- */

// Monta o payload que o backend precisa para criar o pedido de verdade.
// O preço mostrado aqui é só para a interface — quem manda é o backend
// (ver 11. NÃO CONFIAR NO PREÇO DO FRONTEND / pages/api/orders/index.js).
function buildOrderPayload(data, qty) {
  const isKit = data.type === "kit";
  if (isKit) {
    return {
      items: data.items.map((i) => ({ productId: i.id, quantity: i.qty })),
    };
  }
  return { items: [{ productId: data.product.id, quantity: qty }] };
}

function BuyModal({ data, onClose }) {
  const auth = useAuthCtx();
  const cart = useCartCtx();
  const [qty, setQty] = useState(1);
  const [step, setStep] = useState("select");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [order, setOrder] = useState(null);
  const idemKeyRef = useRef(null);

  useEffect(() => {
    setQty(1);
    setErrorMsg("");
    setOrder(null);
    setStep(data?.type === "kit" ? "confirm" : data?.mode === "detail" ? "detail" : "select");
    idemKeyRef.current = null;
  }, [data]);

  // Ao voltar de um redirecionamento de login (Discord), retoma a compra
  // que ficou pendente, se ela pertencer a este modal.
  useEffect(() => {
    if (!auth.user || auth.firstLoginPending) return;
    const pending = loadPendingPurchase();
    if (pending && pending.__resumeToken === data?.__resumeToken) {
      clearPendingPurchase();
      setStep("confirm");
    }
  }, [auth.user, auth.firstLoginPending, data]);

  if (!data) return null;

  const isKit = data.type === "kit";
  const product = data.product;
  const subtotal = isKit ? data.total : (product?.price ?? 0) * qty;

  const goCheckout = () => {
    if (!auth.user) {
      setStep("auth");
      return;
    }
    setStep("confirm");
  };

  const handleAddToCart = () => {
    cart.addItem(product, qty);
    onClose();
  };

  const handleLoginDiscord = () => {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    auth.loginWithDiscord({ ...data, __resumeToken: token });
  };

  const handleLoginPasskey = async () => {
    setBusy(true);
    setErrorMsg("");
    try {
      await auth.loginWithPasskey();
      setStep("confirm");
    } catch (e) {
      setErrorMsg("Não foi possível entrar com a chave de acesso. Tente pelo Discord.");
    } finally {
      setBusy(false);
    }
  };

  const confirmOrder = async () => {
    setBusy(true);
    setErrorMsg("");
    if (!idemKeyRef.current) {
      idemKeyRef.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    try {
      const payload = { ...buildOrderPayload(data, qty), idempotencyKey: idemKeyRef.current };
      const res = await apiFetch("/api/orders", { method: "POST", body: JSON.stringify(payload) });
      setOrder(res.order);
      setStep("success");
    } catch (e) {
      setErrorMsg(e.message || "Não foi possível criar o pedido.");
      setStep("error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mc-modal-overlay" onClick={onClose}>
      <div className="mc-modal" onClick={(e) => e.stopPropagation()}>
        <button className="mc-modal-close" onClick={onClose} aria-label="Fechar">
          <X size={18} />
        </button>

        {!isKit && (product?.image || product?.images?.length > 0) && (
          <div className="mc-modal-image">
            {product.images && product.images.length > 1 ? (
              <CyclingProductImage
                images={product.images}
                alt={product.name}
                className="mc-modal-image-img"
                fallback={null}
              />
            ) : (
              <ImageWithFallback
                src={imgUrl(product.image || product.images[0])}
                alt={product.name}
                className="mc-modal-image-img"
                fallback={null}
              />
            )}
          </div>
        )}

        {!isKit && step === "detail" && (
          <>
            <CategoryBadge category={product.category} />
            <h3 className="mc-modal-title">{product.name}</h3>
            <p className="mc-modal-desc">{product.desc}</p>
            <p className="mc-modal-price">{formatPrice(product.price)}</p>
            <button className="mc-btn mc-btn-primary mc-btn-block" onClick={() => setStep("select")}>
              Comprar agora
            </button>

            <div className="mc-reviews-section">
              <h4 className="mc-reviews-title">⭐ Avaliações</h4>
              <ProductReviews slug={product.id} />
            </div>
          </>
        )}

        {!isKit && step === "select" && (
          <>
            <CategoryBadge category={product.category} />
            <h3 className="mc-modal-title">{product.name}</h3>

            <div className="mc-modal-line">
              <span>Preço unitário</span>
              <span>{formatPrice(product.price)}</span>
            </div>
            <div className="mc-modal-line">
              <span>Quantidade</span>
              <Counter value={qty} onChange={setQty} />
            </div>
            <div className="mc-modal-line">
              <span>Subtotal</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div className="mc-modal-line mc-modal-total">
              <span>Total</span>
              <span>{formatPrice(subtotal)}</span>
            </div>

            <button className="mc-btn mc-btn-primary mc-btn-block" onClick={goCheckout}>
              Continuar compra
            </button>
            <button className="mc-btn mc-btn-outline mc-btn-block mc-btn-mt" onClick={handleAddToCart}>
              <ShoppingCart size={15} /> Adicionar ao carrinho
            </button>
          </>
        )}

        {step === "auth" && (
          <>
            <h3 className="mc-modal-title">Entrar para continuar</h3>
            <p className="mc-modal-desc">
              Para finalizar sua compra, entre com sua conta do Discord (ou com sua
              chave de acesso, se já tiver cadastrado uma neste dispositivo).
            </p>
            {errorMsg && <div className="mc-auth-error"><AlertTriangle size={14} /> {errorMsg}</div>}
            <button className="mc-btn mc-btn-primary mc-btn-block" onClick={handleLoginDiscord} disabled={busy}>
              <UserIcon size={15} /> Entrar com Discord
            </button>
            <button
              className="mc-btn mc-btn-outline mc-btn-block mc-btn-mt"
              onClick={handleLoginPasskey}
              disabled={busy}
            >
              {busy ? <Loader2 size={15} className="mc-spin" /> : <Fingerprint size={15} />} Entrar com digital
            </button>
            <button className="mc-btn mc-btn-ghost mc-btn-block mc-btn-mt" onClick={() => setStep(isKit ? "confirm" : "select")}>
              Voltar
            </button>
          </>
        )}

        {step === "confirm" && (
          <>
            <h3 className="mc-modal-title">{isKit ? data.title : product.name}</h3>

            {isKit ? (
              <ul className="mc-modal-kit-list">
                {data.items.map((i) => (
                  <li key={i.id}>
                    <span>{i.qty}× {i.name}</span>
                    <span>{formatPrice(i.price * i.qty)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mc-modal-line">
                <span>{qty}× {product.name}</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
            )}

            <div className="mc-modal-line mc-modal-total">
              <span>Total</span>
              <span>{formatPrice(subtotal)}</span>
            </div>

            <div className="mc-modal-ticket-msg">
              <p>
                Ao confirmar, o pedido é criado e em poucos segundos abrimos
                automaticamente um canal de atendimento para você no nosso
                servidor do Discord, com o resumo da compra e a chave PIX.
              </p>
            </div>

            {errorMsg && <div className="mc-auth-error"><AlertTriangle size={14} /> {errorMsg}</div>}

            <button className="mc-btn mc-btn-primary mc-btn-block" onClick={confirmOrder} disabled={busy}>
              {busy ? <Loader2 size={15} className="mc-spin" /> : <Check size={15} />} Confirmar pedido
            </button>
            {!isKit && (
              <button className="mc-btn mc-btn-outline mc-btn-block mc-btn-mt" onClick={() => setStep("select")} disabled={busy}>
                Voltar
              </button>
            )}
          </>
        )}

        {step === "success" && order && (
          <>
            <h3 className="mc-modal-title">Pedido criado 🎉</h3>
            <p className="mc-modal-desc">
              Pedido <strong>#{order.code}</strong> registrado com sucesso. Em poucos
              segundos um canal de atendimento será criado para você no nosso servidor
              do Discord — envie o comprovante do PIX por lá.
            </p>
            <div className="mc-modal-ticket-msg">
              <p>Não achou o canal? Confira em "Minha conta" o status do seu pedido.</p>
            </div>
            <button className="mc-btn mc-btn-primary mc-btn-block" onClick={onClose}>
              Entendi
            </button>
          </>
        )}

        {step === "error" && (
          <>
            <h3 className="mc-modal-title">Não deu certo</h3>
            <p className="mc-modal-desc">{errorMsg || "Tente novamente em instantes."}</p>
            <button className="mc-btn mc-btn-primary mc-btn-block" onClick={() => setStep("confirm")}>
              Tentar novamente
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ CADASTRO DE PASSKEY (primeiro login) ------------------------------ */

function CartPanel() {
  const cart = useCartCtx();
  const auth = useAuthCtx();
  const [step, setStep] = useState("cart"); // cart -> auth -> confirm -> success -> error
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [order, setOrder] = useState(null);
  const idemKeyRef = useRef(null);

  const onClose = () => {
    cart.setOpen(false);
    // Não reseta o step na hora de fechar pra evitar flash visual — só na
    // próxima vez que abrir de novo, se já tiver dado certo, o carrinho
    // já vai estar vazio mesmo.
    setTimeout(() => {
      setStep("cart");
      setErrorMsg("");
      setOrder(null);
      idemKeyRef.current = null;
    }, 200);
  };

  const goCheckout = () => {
    if (cart.items.length === 0) return;
    setStep(auth.user ? "confirm" : "auth");
  };

  const handleLoginDiscord = () => {
    // O carrinho já está salvo no localStorage, então sobrevive ao
    // redirecionamento de ida-e-volta do login sem precisar de nada especial.
    auth.loginWithDiscord();
  };

  const handleLoginPasskey = async () => {
    setBusy(true);
    setErrorMsg("");
    try {
      await auth.loginWithPasskey();
      setStep("confirm");
    } catch (e) {
      setErrorMsg("Não foi possível entrar com a chave de acesso. Tente pelo Discord.");
    } finally {
      setBusy(false);
    }
  };

  const confirmOrder = async () => {
    setBusy(true);
    setErrorMsg("");
    if (!idemKeyRef.current) {
      idemKeyRef.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    try {
      const payload = {
        items: cart.items.map((i) => ({ productId: i.id, quantity: i.qty })),
        idempotencyKey: idemKeyRef.current,
      };
      const res = await apiFetch("/api/orders", { method: "POST", body: JSON.stringify(payload) });
      setOrder(res.order);
      cart.clear();
      setStep("success");
    } catch (e) {
      setErrorMsg(e.message || "Não foi possível criar o pedido.");
      setStep("error");
    } finally {
      setBusy(false);
    }
  };

  if (!cart.open) return null;

  return (
    <div className="mc-modal-overlay" onClick={onClose}>
      <div className="mc-modal mc-modal-cart" onClick={(e) => e.stopPropagation()}>
        <button className="mc-modal-close" onClick={onClose} aria-label="Fechar">
          <X size={18} />
        </button>

        {step === "cart" && (
          <>
            <h3 className="mc-modal-title"><ShoppingCart size={18} className="mc-title-icon" /> Seu carrinho</h3>

            {cart.items.length === 0 ? (
              <p className="mc-modal-desc">Seu carrinho está vazio. Adicione kits no catálogo!</p>
            ) : (
              <ul className="mc-cart-list">
                {cart.items.map((i) => (
                  <li key={i.id} className="mc-cart-item">
                    <div className="mc-cart-item-info">
                      <span className="mc-cart-item-name">{i.name}</span>
                      <span className="mc-cart-item-price">{formatPrice(i.price)} cada</span>
                    </div>
                    <Counter value={i.qty} min={0} onChange={(v) => cart.setQty(i.id, v)} />
                    <button
                      className="mc-cart-item-remove"
                      aria-label={`Remover ${i.name}`}
                      onClick={() => cart.removeItem(i.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {cart.items.length > 0 && (
              <>
                <div className="mc-modal-line mc-modal-total">
                  <span>Total</span>
                  <span>{formatPrice(cart.total)}</span>
                </div>
                <button className="mc-btn mc-btn-primary mc-btn-block" onClick={goCheckout}>
                  Finalizar compra
                </button>
              </>
            )}
          </>
        )}

        {step === "auth" && (
          <>
            <h3 className="mc-modal-title">Entrar para continuar</h3>
            <p className="mc-modal-desc">
              Para finalizar sua compra, entre com sua conta do Discord (ou com sua
              chave de acesso, se já tiver cadastrado uma neste dispositivo).
            </p>
            {errorMsg && <div className="mc-auth-error"><AlertTriangle size={14} /> {errorMsg}</div>}
            <button className="mc-btn mc-btn-primary mc-btn-block" onClick={handleLoginDiscord} disabled={busy}>
              <UserIcon size={15} /> Entrar com Discord
            </button>
            <button
              className="mc-btn mc-btn-outline mc-btn-block mc-btn-mt"
              onClick={handleLoginPasskey}
              disabled={busy}
            >
              {busy ? <Loader2 size={15} className="mc-spin" /> : <Fingerprint size={15} />} Entrar com digital
            </button>
            <button className="mc-btn mc-btn-ghost mc-btn-block mc-btn-mt" onClick={() => setStep("cart")}>
              Voltar
            </button>
          </>
        )}

        {step === "confirm" && (
          <>
            <h3 className="mc-modal-title">Confirmar pedido</h3>

            <ul className="mc-modal-kit-list">
              {cart.items.map((i) => (
                <li key={i.id}>
                  <span>{i.qty}× {i.name}</span>
                  <span>{formatPrice(i.price * i.qty)}</span>
                </li>
              ))}
            </ul>

            <div className="mc-modal-line mc-modal-total">
              <span>Total</span>
              <span>{formatPrice(cart.total)}</span>
            </div>

            <div className="mc-modal-ticket-msg">
              <p>
                Ao confirmar, o pedido é criado e em poucos segundos abrimos
                automaticamente um canal de atendimento para você no nosso
                servidor do Discord, com o resumo da compra e a chave PIX.
              </p>
            </div>

            {errorMsg && <div className="mc-auth-error"><AlertTriangle size={14} /> {errorMsg}</div>}

            <button className="mc-btn mc-btn-primary mc-btn-block" onClick={confirmOrder} disabled={busy}>
              {busy ? <Loader2 size={15} className="mc-spin" /> : <Check size={15} />} Confirmar pedido
            </button>
            <button className="mc-btn mc-btn-outline mc-btn-block mc-btn-mt" onClick={() => setStep("cart")} disabled={busy}>
              Voltar
            </button>
          </>
        )}

        {step === "success" && order && (
          <>
            <h3 className="mc-modal-title">Pedido criado 🎉</h3>
            <p className="mc-modal-desc">
              Pedido <strong>#{order.code}</strong> registrado com sucesso. Em poucos
              segundos um canal de atendimento será criado para você no nosso servidor
              do Discord — envie o comprovante do PIX por lá.
            </p>
            <button className="mc-btn mc-btn-primary mc-btn-block" onClick={onClose}>
              Entendi
            </button>
          </>
        )}

        {step === "error" && (
          <>
            <h3 className="mc-modal-title">Não deu certo</h3>
            <p className="mc-modal-desc">{errorMsg || "Tente novamente em instantes."}</p>
            <button className="mc-btn mc-btn-primary mc-btn-block" onClick={() => setStep("confirm")}>
              Tentar novamente
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function PasskeyPrompt() {
  const auth = useAuthCtx();
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

console.log("PASSKEY PROMPT:", {
  firstLoginPending: auth.firstLoginPending,
  user: auth.user,
});

if (!auth.firstLoginPending || !auth.user) return null;

  const resumeAfterPrompt = () => {
    auth.clearFirstLoginPending();
    // Se havia uma compra pendente (usuário veio do fluxo de checkout),
    // ela é retomada automaticamente pelo próprio BuyModal ao perceber
    // auth.user preenchido — aqui só liberamos a tela.
  };

  const handleRegister = async () => {
    setBusy(true);
    setErrorMsg("");
    try {
      await auth.registerPasskey();
      resumeAfterPrompt();
    } catch (e) {
      setErrorMsg("Não foi possível cadastrar a chave neste dispositivo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mc-modal-overlay">
      <div className="mc-modal mc-modal-passkey" onClick={(e) => e.stopPropagation()}>
        <h3 className="mc-modal-title">👆 Entrar mais rápido</h3>
        <p className="mc-modal-desc">
          Quer cadastrar uma chave de acesso (Passkey) neste dispositivo? Nas
          próximas vezes você poderá entrar usando sua impressão digital,
          reconhecimento facial ou outro método de autenticação disponível.
        </p>
        <p className="mc-modal-desc">
          Sua biometria permanece protegida no seu dispositivo e nunca é
          enviada para a loja.
        </p>
        {errorMsg && <div className="mc-auth-error"><AlertTriangle size={14} /> {errorMsg}</div>}
        <button className="mc-btn mc-btn-primary mc-btn-block" onClick={handleRegister} disabled={busy}>
          {busy ? <Loader2 size={15} className="mc-spin" /> : <Fingerprint size={15} />} Cadastrar digital
        </button>
        <button className="mc-btn mc-btn-outline mc-btn-block mc-btn-mt" onClick={resumeAfterPrompt} disabled={busy}>
          Agora não
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ MINHA CONTA ------------------------------ */

const ORDER_STATUS_LABEL = {
  PENDING_PAYMENT: "Aguardando pagamento",
  PAYMENT_REVIEW: "Comprovante em análise",
  PAID: "Pagamento aprovado",
  DELIVERING: "Em entrega",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

function AccountPanel({ onClose }) {
  const auth = useAuthCtx();
  const [orders, setOrders] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    apiFetch("/api/orders")
      .then((res) => setOrders(res.orders))
      .catch(() => setErrorMsg("Não foi possível carregar seus pedidos."));
  }, []);

  return (
    <div className="mc-modal-overlay" onClick={onClose}>
      <div className="mc-modal mc-modal-account" onClick={(e) => e.stopPropagation()}>
        <button className="mc-modal-close" onClick={onClose} aria-label="Fechar">
          <X size={18} />
        </button>
        <h3 className="mc-modal-title">Minha conta</h3>
        <div className="mc-modal-line">
          <span>Discord</span>
          <span>@{auth.user?.username}</span>
        </div>

        <h4 className="mc-account-orders-title"><Package size={14} /> Pedidos</h4>
        {errorMsg && <div className="mc-auth-error"><AlertTriangle size={14} /> {errorMsg}</div>}
        {!orders && !errorMsg && <p className="mc-modal-desc">Carregando pedidos...</p>}
        {orders && orders.length === 0 && <p className="mc-modal-desc">Você ainda não fez nenhum pedido.</p>}
        {orders && orders.length > 0 && (
          <ul className="mc-modal-kit-list mc-account-orders-list">
            {orders.map((o) => (
              <li key={o.id}>
                <span>#{o.code} — {formatPrice(o.total)}</span>
                <span>{ORDER_STATUS_LABEL[o.status] || o.status}</span>
              </li>
            ))}
          </ul>
        )}

        <button className="mc-btn mc-btn-outline mc-btn-block mc-btn-mt" onClick={auth.logout}>
          <LogOut size={15} /> Sair da conta
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ FOOTER ------------------------------------------------ */

function Footer() {
  const go = (href) => {
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <footer className="mc-footer">
      <div className="mc-footer-top">
        <Logo size={30} />
        <p className="mc-footer-tagline">Servidor de Minecraft</p>
      </div>

      <nav className="mc-footer-links">
        <button onClick={() => go("#inicio")}>Início</button>
        <button onClick={() => go("#catalogo")}>Catálogo</button>
        <button onClick={() => go("#vip")}>VIP</button>
        <button onClick={() => go("#bases")}>Bases</button>
        <button onClick={() => go("#pagamento")}>Pagamento</button>
        <a href={DISCORD_LINK} target="_blank" rel="noopener noreferrer">Suporte</a>
      </nav>

      <div className="mc-footer-bottom">
        <p>© 2026 MTL CRAFT. Todos os direitos reservados.</p>
        <p className="mc-footer-note">
          Todos os produtos são vendidos exclusivamente pela equipe MTL CRAFT.
        </p>
      </div>
    </footer>
  );
}

/* ------------------------------ APP ROOT ------------------------------------------------ */

function MtlCraftApp() {
  const auth = useAuthCtx();
  const [modal, setModal] = useState(null); // { product, mode } | { type:'kit', ... }

  // Depois de um login via Discord (redirecionamento de página inteira),
  // retoma automaticamente a compra que o usuário tinha deixado pendente —
  // mas só quando o cadastro de Passkey do primeiro login já foi resolvido.
  useEffect(() => {
    if (!auth.user || auth.firstLoginPending) return;
    const pending = loadPendingPurchase();
    if (pending) {
      clearPendingPurchase();
      setModal(pending);
    }
  }, [auth.user, auth.firstLoginPending]);

  useEffect(() => {
    const link1 = document.createElement("link");
    link1.rel = "preconnect";
    link1.href = "https://fonts.googleapis.com";
    const link2 = document.createElement("link");
    link2.rel = "stylesheet";
    link2.href =
      "https://fonts.googleapis.com/css2?family=Orbitron:wght@600;700;800&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap";
    document.head.appendChild(link1);
    document.head.appendChild(link2);
    return () => {
      document.head.removeChild(link1);
      document.head.removeChild(link2);
    };
  }, []);

  const openBuy = useCallback((product, mode) => {
    setModal({ product, mode });
  }, []);

  const openTicket = useCallback((kitData) => {
    setModal(kitData);
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  const scrollTo = (href) => {
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mc-root">
      <style>{CSS}</style>

      <Navbar />
      <Hero onGoCatalog={() => scrollTo("#catalogo")} onGoVip={() => scrollTo("#vip")} />
      <main>
        <CategoriesSection onSelect={(key) => scrollTo(CATEGORY_META[key]?.anchor || "#catalogo")} />
        <FeaturedSection onBuy={openBuy} />
        <CatalogSection onBuy={openBuy} />
        <KitsSection onBuy={openBuy} />
        <VipSection onBuy={openBuy} />
        <CustomKitSection openTicket={openTicket} />
        <TagSection onBuy={openBuy} />
        <BasesSection onBuy={openBuy} />
        <CoordSection />
        <PaymentSection />
      </main>
      <Footer />

      {modal && <BuyModal data={modal} onClose={closeModal} />}
      <CartPanel />
      <PasskeyPrompt />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <MtlCraftApp />
      </CartProvider>
    </AuthProvider>
  );
}

/* ================================ CSS ================================== */

const CSS = `
:root{
  --void:#05070A;
  --base:#0B0F14;
  --panel:#101722;
  --panel-2:#172131;
  --blue-900:#1D4ED8;
  --blue-600:#2563EB;
  --blue-500:#3B82F6;
  --blue-400:#60A5FA;
  --white:#FFFFFF;
  --muted:#8DA0BE;
  --border:rgba(96,165,250,0.14);
  --font-display:'Orbitron', system-ui, sans-serif;
  --font-body:'Inter', system-ui, sans-serif;
  --font-mono:'JetBrains Mono', monospace;
}

.mc-root{
  background:var(--void);
  color:var(--white);
  font-family:var(--font-body);
  min-height:100vh;
  overflow-x:hidden;
}
.mc-root *{ box-sizing:border-box; }
.mc-root button{ font-family:inherit; cursor:pointer; }
.mc-root input, .mc-root select{ font-family:inherit; }
.mc-root ul, .mc-root ol{ margin:0; padding:0; list-style:none; }

@keyframes mcFloatUp{
  0%{ transform:translateY(110vh) translateX(0); opacity:0; }
  10%{ opacity:1; }
  90%{ opacity:1; }
  100%{ transform:translateY(-10vh) translateX(20px); opacity:0; }
}
@keyframes mcPulseGlow{
  0%,100%{ opacity:0.55; }
  50%{ opacity:1; }
}
@keyframes mcSpin{
  from{ transform:rotate(0deg); }
  to{ transform:rotate(360deg); }
}

/* ---------- Logo ---------- */
.mc-logo{ display:flex; align-items:center; gap:10px; }
.mc-logo-mark{
  background:linear-gradient(135deg, var(--blue-400), var(--blue-600));
  border-radius:9px;
  display:flex; align-items:center; justify-content:center;
  box-shadow:0 0 22px rgba(59,130,246,0.55);
  flex-shrink:0;
}
.mc-logo-text{
  font-family:var(--font-display);
  font-weight:800;
  font-size:18px;
  letter-spacing:0.5px;
}
.mc-logo-accent{ color:var(--blue-400); }

/* ---------- Navbar ---------- */
.mc-nav{
  position:sticky; top:0; z-index:60;
  background:rgba(5,7,10,0.55);
  backdrop-filter:blur(14px);
  -webkit-backdrop-filter:blur(14px);
  border-bottom:1px solid transparent;
  transition:background 0.3s ease, border-color 0.3s ease;
}
.mc-nav-scrolled{
  background:rgba(5,7,10,0.86);
  border-bottom:1px solid var(--border);
}
.mc-nav-inner{
  max-width:1240px; margin:0 auto;
  display:flex; align-items:center; justify-content:space-between;
  padding:14px 24px;
}
.mc-nav-logo-btn{ background:none; border:none; padding:0; }
.mc-nav-links{ display:none; gap:6px; }
.mc-nav-link{
  background:none; border:none; color:var(--muted);
  font-size:13.5px; font-weight:600; padding:8px 12px; border-radius:8px;
  transition:color 0.2s ease, background 0.2s ease;
  white-space:nowrap;
}
.mc-nav-link:hover{ color:var(--white); background:rgba(59,130,246,0.1); }
.mc-nav-actions{ display:flex; align-items:center; gap:10px; }
.mc-nav-burger{
  background:rgba(23,33,49,0.7); border:1px solid var(--border);
  color:var(--white); width:40px; height:40px; border-radius:10px;
  display:flex; align-items:center; justify-content:center;
}
.mc-nav-mobile{
  max-height:0; overflow:hidden; opacity:0;
  transition:max-height 0.35s ease, opacity 0.25s ease;
  padding:0 20px; display:flex; flex-direction:column; gap:2px;
}
.mc-nav-mobile-open{ max-height:520px; opacity:1; padding:6px 20px 20px; border-top:1px solid var(--border); }
.mc-nav-mobile-link{
  display:flex; align-items:center; justify-content:space-between;
  background:none; border:none; color:var(--white); text-align:left;
  padding:13px 4px; font-size:14.5px; font-weight:600;
  border-bottom:1px solid rgba(255,255,255,0.05);
}
.mc-nav-mobile .mc-btn{ margin-top:14px; }

@media (min-width:1024px){
  .mc-nav-links{ display:flex; }
  .mc-nav-burger{ display:none; }
  .mc-nav-mobile{ display:none; }
}

/* ---------- Buttons ---------- */
.mc-btn{
  display:inline-flex; align-items:center; justify-content:center; gap:8px;
  border-radius:12px; border:1px solid transparent;
  font-weight:700; font-size:14px; padding:12px 20px;
  transition:transform 0.18s ease, box-shadow 0.25s ease, background 0.25s ease, border-color .2s ease, opacity .2s ease;
  white-space:nowrap;
}
.mc-btn:disabled{ opacity:0.4; cursor:not-allowed; }
.mc-btn:active:not(:disabled){ transform:scale(0.97); }
.mc-btn-primary{
  background:linear-gradient(135deg, var(--blue-500), var(--blue-900));
  color:var(--white);
  box-shadow:0 0 0 rgba(59,130,246,0);
}
.mc-btn-primary:hover:not(:disabled){
  box-shadow:0 0 26px rgba(59,130,246,0.55);
  transform:translateY(-1px);
}
.mc-btn-success{ background:linear-gradient(135deg,#22c55e,#15803d); color:#fff; }
.mc-btn-ghost{
  background:rgba(255,255,255,0.04); color:var(--white); border-color:var(--border);
}
.mc-btn-ghost:hover{ background:rgba(59,130,246,0.12); border-color:var(--blue-500); }
.mc-btn-outline{
  background:transparent; color:var(--blue-400); border-color:rgba(96,165,250,0.4);
}
.mc-btn-outline:hover:not(:disabled){ background:rgba(59,130,246,0.1); border-color:var(--blue-400); }
.mc-btn-sm{ padding:9px 16px; font-size:13px; }
.mc-btn-xs{ padding:8px 12px; font-size:12.5px; border-radius:9px; }
.mc-btn-lg{ padding:15px 26px; font-size:15px; border-radius:14px; }
.mc-btn-block{ width:100%; }
.mc-btn-mt{ margin-top:10px; }

/* ---------- Hero ---------- */
.mc-hero{
  position:relative; padding:150px 24px 120px; text-align:center;
  overflow:hidden;
  background:
    radial-gradient(ellipse 60% 50% at 50% 0%, rgba(37,99,235,0.22), transparent 70%),
    linear-gradient(180deg, var(--void) 0%, var(--base) 100%);
}
.mc-hero-grid{
  position:absolute; inset:0;
  background-image:
    linear-gradient(rgba(96,165,250,0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(96,165,250,0.06) 1px, transparent 1px);
  background-size:46px 46px;
  mask-image:radial-gradient(ellipse 70% 60% at 50% 20%, black, transparent 75%);
  -webkit-mask-image:radial-gradient(ellipse 70% 60% at 50% 20%, black, transparent 75%);
}
.mc-hero-glow{
  position:absolute; top:-140px; left:50%; transform:translateX(-50%);
  width:640px; height:640px; border-radius:999px;
  background:radial-gradient(circle, rgba(59,130,246,0.35), transparent 65%);
  filter:blur(10px);
  animation:mcPulseGlow 5s ease-in-out infinite;
}
.mc-particles{ position:absolute; inset:0; pointer-events:none; }
.mc-particle{
  position:absolute; bottom:0; border-radius:3px;
  background:linear-gradient(135deg, var(--blue-400), var(--blue-600));
  box-shadow:0 0 8px rgba(96,165,250,0.8);
  animation-name:mcFloatUp; animation-timing-function:linear; animation-iteration-count:infinite;
}
.mc-hero-content{ position:relative; max-width:760px; margin:0 auto; }
.mc-eyebrow{
  display:inline-flex; align-items:center; gap:6px;
  font-size:12px; font-weight:700; letter-spacing:1.4px; text-transform:uppercase;
  color:var(--blue-400); background:rgba(59,130,246,0.1);
  border:1px solid rgba(96,165,250,0.3); padding:7px 14px; border-radius:999px;
  margin-bottom:22px;
}
.mc-hero-title{
  font-family:var(--font-display); font-weight:800;
  font-size:clamp(42px, 9vw, 84px); line-height:1; letter-spacing:1px;
  margin:0 0 18px;
}
.mc-hero-title-accent{
  color:var(--blue-400);
  text-shadow:0 0 40px rgba(59,130,246,0.8), 0 0 90px rgba(59,130,246,0.4);
}
.mc-hero-subtitle{
  font-size:clamp(17px, 2.6vw, 22px); font-weight:600; color:var(--white);
  margin:0 0 14px;
}
.mc-hero-text{
  font-size:15.5px; color:var(--muted); line-height:1.7; max-width:560px;
  margin:0 auto 38px;
}
.mc-hero-actions{ display:flex; flex-wrap:wrap; gap:14px; justify-content:center; }
.mc-hero-fade{
  position:absolute; bottom:0; left:0; right:0; height:120px;
  background:linear-gradient(180deg, transparent, var(--void));
}

/* ---------- Section shell ---------- */
.mc-section{
  max-width:1240px; margin:0 auto; padding:88px 24px;
}
.mc-section-alt{ background:linear-gradient(180deg, transparent, rgba(23,33,49,0.35), transparent); }
.mc-section-title{
  font-family:var(--font-display); font-weight:700;
  font-size:clamp(24px, 3.4vw, 34px);
  display:flex; align-items:center; gap:10px; margin:0 0 10px;
}
.mc-section-title-spaced{ margin-top:64px; }
.mc-title-icon{ color:var(--blue-400); }
.mc-section-sub{ color:var(--muted); font-size:15px; max-width:640px; margin:0 0 36px; line-height:1.6; }
.mc-inline-note{ color:var(--muted); font-size:12.5px; font-style:italic; margin:2px 0; }
.mc-inline-note-tight{ margin:4px 0 0; }

/* ---------- Categories ---------- */
.mc-cat-grid{
  display:grid; grid-template-columns:repeat(2,1fr); gap:14px;
}
.mc-cat-card{
  display:flex; align-items:center; gap:14px;
  background:var(--panel); border:1px solid var(--border); border-radius:16px;
  padding:20px; text-align:left; color:var(--white); width:100%;
  transition:border-color .25s ease, box-shadow .25s ease, transform .2s ease;
}
.mc-cat-card:hover{
  border-color:var(--blue-500); box-shadow:0 0 24px rgba(59,130,246,0.25);
  transform:translateY(-2px);
}
.mc-cat-emoji{ font-size:26px; }
.mc-cat-label{ font-weight:700; font-size:14.5px; flex:1; }
.mc-cat-arrow{ color:var(--blue-400); flex-shrink:0; }
@media (min-width:700px){ .mc-cat-grid{ grid-template-columns:repeat(3,1fr); } }
@media (min-width:1024px){ .mc-cat-grid{ grid-template-columns:repeat(6,1fr); } .mc-cat-card{ flex-direction:column; text-align:center; gap:10px; } .mc-cat-arrow{ display:none; } }

/* ---------- Grids ---------- */
.mc-grid{ display:grid; gap:18px; grid-template-columns:1fr; }
@media (min-width:640px){ .mc-grid-2{ grid-template-columns:repeat(2,1fr); } .mc-grid-3{ grid-template-columns:repeat(2,1fr);} .mc-grid-4{ grid-template-columns:repeat(2,1fr);} }
@media (min-width:900px){ .mc-grid-3{ grid-template-columns:repeat(3,1fr);} .mc-grid-4{ grid-template-columns:repeat(3,1fr);} }
@media (min-width:1180px){ .mc-grid-4{ grid-template-columns:repeat(4,1fr);} }

/* ---------- Product card ---------- */
.mc-card{
  position:relative;
  background:linear-gradient(180deg, var(--panel), var(--base));
  border:1px solid var(--border); border-radius:18px; padding:22px;
  display:flex; flex-direction:column; gap:12px;
  transition:transform .25s cubic-bezier(.16,.84,.44,1), box-shadow .25s ease, border-color .25s ease;
}
.mc-card:hover{
  transform:translateY(-4px);
  border-color:rgba(96,165,250,0.55);
  box-shadow:0 12px 34px -10px rgba(0,0,0,0.6), 0 0 26px -6px rgba(59,130,246,0.4);
}
.mc-card-featured{
  border-color:rgba(96,165,250,0.5);
  background:linear-gradient(160deg, rgba(37,99,235,0.16), var(--panel) 60%);
  box-shadow:0 0 0 1px rgba(59,130,246,0.2) inset;
}
.mc-card-ribbon{
  position:absolute; top:14px; right:14px; z-index:2;
  display:flex; align-items:center; gap:4px;
  background:linear-gradient(135deg, var(--blue-400), var(--blue-600));
  color:#04101f; font-size:10.5px; font-weight:800; letter-spacing:0.4px;
  padding:5px 9px; border-radius:999px; text-transform:uppercase;
}
.mc-card-image{
  width:100%; aspect-ratio:16/11; border-radius:12px; overflow:hidden;
  background:radial-gradient(circle at 50% 30%, rgba(59,130,246,0.18), var(--base) 75%);
  border:1px solid var(--border); margin:-4px -4px 2px;
}
.mc-card-image-img{ width:100%; height:100%; object-fit:cover; display:block; transition:transform .4s ease; }
.mc-card-image-cycling{ animation:mcImgFade 0.6s ease; }
@keyframes mcImgFade{ from{ opacity:0.15; } to{ opacity:1; } }
.mc-card:hover .mc-card-image-img{ transform:scale(1.06); }
.mc-card-image-fallback{
  width:100%; height:100%; display:flex; align-items:center; justify-content:center;
  color:rgba(96,165,250,0.55);
}
.mc-card-top{ display:flex; align-items:center; justify-content:space-between; }
.mc-card-icon{
  width:42px; height:42px; border-radius:11px;
  background:rgba(59,130,246,0.14); border:1px solid rgba(96,165,250,0.3);
  display:flex; align-items:center; justify-content:center; color:var(--blue-400);
}
.mc-badge{
  display:inline-flex; align-items:center; gap:5px;
  font-size:10.5px; font-weight:700; letter-spacing:0.3px; text-transform:uppercase;
  color:var(--blue-400); background:rgba(59,130,246,0.1);
  border:1px solid rgba(96,165,250,0.25); padding:5px 9px; border-radius:999px;
}
.mc-card-name{ font-size:16.5px; font-weight:800; margin:0; letter-spacing:0.2px; }
.mc-card-desc{ font-size:13px; color:var(--muted); line-height:1.55; margin:0; flex:1; }
.mc-card-stock{ font-size:12px; color:var(--muted); margin:0; }
.mc-card-bottom{ display:flex; align-items:flex-end; justify-content:space-between; gap:10px; margin-top:4px; }
.mc-card-price{ font-family:var(--font-mono); font-size:19px; font-weight:700; color:var(--white); }
.mc-card-actions{ display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }

/* ---------- Counter ---------- */
.mc-counter{ display:flex; align-items:center; gap:10px; }
.mc-counter-btn{
  width:28px; height:28px; border-radius:8px; border:1px solid var(--border);
  background:rgba(255,255,255,0.04); color:var(--white);
  display:flex; align-items:center; justify-content:center;
  transition:background .2s ease, border-color .2s ease;
}
.mc-counter-btn:hover{ background:rgba(59,130,246,0.15); border-color:var(--blue-500); }
.mc-counter-val{ min-width:20px; text-align:center; font-family:var(--font-mono); font-weight:700; }

/* ---------- VIP ---------- */
.mc-vip-grid{ display:grid; gap:22px; grid-template-columns:1fr; max-width:820px; margin:0 auto; }
@media (min-width:700px){ .mc-vip-grid{ grid-template-columns:repeat(2,1fr); } }
.mc-vip-card{
  position:relative;
  background:linear-gradient(160deg, var(--panel-2), var(--panel));
  border:1px solid var(--border); border-radius:22px; padding:32px 26px;
  display:flex; flex-direction:column; gap:16px;
  transition:transform .25s ease, box-shadow .25s ease;
}
.mc-vip-card:hover{ transform:translateY(-4px); }
.mc-vip-card-popular{
  border-color:var(--blue-500);
  box-shadow:0 0 0 1px rgba(59,130,246,0.4) inset, 0 0 50px -10px rgba(59,130,246,0.5);
}
.mc-vip-tag{
  position:absolute; top:-13px; left:50%; transform:translateX(-50%);
  background:linear-gradient(135deg, var(--blue-400), var(--blue-600));
  color:#04101f; font-size:11px; font-weight:800; letter-spacing:0.6px;
  padding:6px 16px; border-radius:999px; box-shadow:0 0 20px rgba(59,130,246,0.6);
  white-space:nowrap;
}
.mc-vip-period{ font-size:13px; font-weight:700; color:var(--blue-400); text-transform:uppercase; letter-spacing:1px; margin:0; }
.mc-vip-price{ font-family:var(--font-mono); font-size:38px; font-weight:800; margin:0; }
.mc-vip-benefits{ display:flex; flex-direction:column; gap:11px; margin:4px 0 8px; }
.mc-vip-benefits li{ display:flex; align-items:center; gap:10px; font-size:13.5px; color:#D6E2F5; }
.mc-vip-benefits li svg{ color:var(--blue-400); flex-shrink:0; }

.mc-note-box{
  max-width:640px; margin:36px auto 0; text-align:center;
  color:var(--muted); font-size:12.5px; line-height:1.9;
  border-top:1px solid var(--border); padding-top:18px;
}
.mc-note-box-tight{ margin-top:18px; padding-top:14px; }

/* ---------- Kit builder ---------- */
.mc-builder{ display:grid; gap:22px; grid-template-columns:1fr; margin-top:8px; }
@media (min-width:960px){ .mc-builder{ grid-template-columns:1.4fr 1fr; align-items:start; } }
.mc-builder-list{
  background:var(--panel); border:1px solid var(--border); border-radius:18px;
  padding:8px;