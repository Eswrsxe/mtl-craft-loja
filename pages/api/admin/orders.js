const crypto = require("crypto");
const { prisma } = require("../../../lib/prisma");
const { getSessionFromReq } = require("../../../lib/session");
const { isAdminSession } = require("../../../lib/adminAuth");
const { generateUniqueOrderCode } = require("../../../lib/orderCode");
const { CLAN_PRODUCT_SLUG, validateClanName } = require("../../../lib/clan");
const { isValidDiscordId, resolveTargetMember } = require("../../../lib/discordMember");

// Abre um pedido no NOME de outra pessoa (só admin). É a mesma criação de
// pedido do site (POST /api/orders) com 3 diferenças de propósito:
//
//   1. O comprador é o `targetDiscordId` informado, não quem está logado: o
//      ticket e tudo mais aparecem no nome dessa pessoa, como se ela tivesse
//      feito o pedido.
//   2. NÃO existe a trava de "1 atendimento em aberto por vez": o admin pode
//      abrir outro pedido mesmo com pedido/ticket aberto.
//   3. A idempotencyKey começa com "admin-": é assim que o BOT reconhece o
//      pedido como exceção e abre o ticket mesmo com outro ticket aberto do
//      mesmo comprador (ver lib/orderWatcher.js do bot — o prefixo tem que ser
//      o mesmo nos dois lados). A chave também guarda qual admin abriu.
const ADMIN_ORDER_KEY_PREFIX = "admin-";

export default async function handler(req, res) {
  const session = await getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: "Faça login para continuar." });
  if (!isAdminSession(session)) return res.status(403).json({ error: "Acesso restrito à equipe." });

  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  const { targetDiscordId, items, couponCode, clanName, idempotencyKey } = req.body || {};

  const targetId = String(targetDiscordId || "").trim();
  if (!isValidDiscordId(targetId)) {
    return res.status(400).json({ error: "Informe um ID do Discord válido (17 a 20 números)." });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Carrinho vazio." });
  }
  for (const it of items) {
    if (!it || typeof it.productId !== "string" || !Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 99) {
      return res.status(400).json({ error: "Item de pedido inválido." });
    }
  }

  // Clã Oficial: mesmas regras do site (sozinho, 1 unidade, com o Nome do Clã).
  let validClanName = null;
  if (items.some((it) => it.productId === CLAN_PRODUCT_SLUG)) {
    if (items.length !== 1 || items[0].quantity !== 1) {
      return res.status(400).json({ error: "O Clã Oficial deve ser comprado sozinho, 1 unidade por pedido." });
    }
    const checked = validateClanName(clanName);
    if (!checked.ok) return res.status(400).json({ error: checked.error });
    validClanName = checked.value;
  }

  // Nunca confiar em preço vindo do navegador: busca o produto real no banco.
  const slugs = [...new Set(items.map((i) => i.productId))];
  const products = await prisma.product.findMany({ where: { slug: { in: slugs }, active: true } });
  const productBySlug = Object.fromEntries(products.map((p) => [p.slug, p]));
  const missing = slugs.filter((s) => !productBySlug[s]);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Produto indisponível: ${missing.join(", ")}` });
  }

  let subtotal = 0;
  const orderItemsData = items.map((it) => {
    const product = productBySlug[it.productId];
    const unitPrice = Number(product.price);
    const lineTotal = Math.round(unitPrice * it.quantity * 100) / 100;
    subtotal += lineTotal;
    return { productId: product.id, nameSnapshot: product.name, unitPrice, quantity: it.quantity, lineTotal };
  });
  subtotal = Math.round(subtotal * 100) / 100;

  // Cupom (opcional) — mesmas regras e mensagens do site.
  let coupon = null;
  let couponDiscount = 0;
  if (couponCode && String(couponCode).trim()) {
    coupon = await prisma.coupon.findUnique({ where: { code: String(couponCode).trim().toUpperCase() } });
    const invalidCouponMsg = validateCoupon(coupon);
    if (invalidCouponMsg) return res.status(400).json({ error: invalidCouponMsg });
    couponDiscount =
      coupon.discountType === "PERCENT"
        ? (subtotal * Number(coupon.discountValue)) / 100
        : Number(coupon.discountValue);
    couponDiscount = Math.round(couponDiscount * 100) / 100;
  }
  // Sempre sobra pelo menos R$ 1,00 a pagar (não existe PIX de R$ 0,00).
  const maxTotalDiscount = Math.max(0, subtotal - 1);
  if (couponDiscount > maxTotalDiscount) couponDiscount = maxTotalDiscount;
  const discountAmount = Math.round(couponDiscount * 100) / 100;
  const total = Math.round((subtotal - discountAmount) * 100) / 100;

  // Quem é a pessoa (e se está no servidor).
  const target = await resolveTargetMember(prisma, targetId);
  if (!target.ok) return res.status(target.status).json({ error: target.error });

  const rawKey = typeof idempotencyKey === "string" ? idempotencyKey.trim().slice(0, 64) : "";
  const key = `${ADMIN_ORDER_KEY_PREFIX}${session.discordId}-${rawKey || crypto.randomUUID()}`;

  // Reenvio do mesmo clique/retry de rede: devolve o pedido já criado.
  const already = await prisma.order.findUnique({
    where: { idempotencyKey: key },
    select: { id: true, code: true, total: true, status: true, discountAmount: true },
  });
  if (already) return res.status(200).json({ order: already, target: publicTarget(target) });

  // Cria a conta da pessoa se ela ainda nunca entrou no site (o pedido precisa
  // de um User) e, quando os dados vêm do Discord, já atualiza nome/foto.
  const user = target.fromDiscord
    ? await prisma.user.upsert({
        where: { discordId: target.profile.discordId },
        update: { username: target.profile.username, avatar: target.profile.avatar },
        create: {
          discordId: target.profile.discordId,
          username: target.profile.username,
          discriminator: target.profile.discriminator,
          avatar: target.profile.avatar,
        },
      })
    : await prisma.user.findUnique({ where: { discordId: target.profile.discordId } });

  const code = await generateUniqueOrderCode(prisma);

  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      if (coupon && coupon.maxUses !== null) {
        const updated = await tx.coupon.updateMany({
          where: { id: coupon.id, usedCount: { lt: coupon.maxUses } },
          data: { usedCount: { increment: 1 } },
        });
        if (updated.count === 0) throw new Error("COUPON_EXHAUSTED");
      } else if (coupon) {
        await tx.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
      }

      return tx.order.create({
        data: {
          code,
          idempotencyKey: key,
          userId: user.id,
          subtotal,
          couponCode: coupon ? coupon.code : null,
          discountAmount,
          total,
          clanName: validClanName,
          items: { create: orderItemsData },
        },
        select: { id: true, code: true, total: true, status: true, discountAmount: true },
      });
    });
  } catch (e) {
    if (e.message === "COUPON_EXHAUSTED") {
      return res.status(400).json({ error: "Esse cupom acabou de atingir o limite de usos." });
    }
    const existing = await prisma.order.findUnique({
      where: { idempotencyKey: key },
      select: { id: true, code: true, total: true, status: true, discountAmount: true },
    });
    if (existing) return res.status(200).json({ order: existing, target: publicTarget(target) });
    console.error("Erro ao criar pedido (admin):", e);
    return res.status(500).json({ error: "Não foi possível criar o pedido." });
  }

  console.log(`[admin] ${session.discordId} abriu o pedido #${order.code} no nome de ${target.profile.username} (${target.profile.discordId}).`);

  // Não precisa avisar o bot: o orderWatcher acha o pedido (PENDING_PAYMENT sem
  // ticket) e abre o atendimento sozinho — e, pelo prefixo "admin-", sem
  // esperar o outro ticket da pessoa fechar.
  return res.status(201).json({ order, target: publicTarget(target) });
}

function publicTarget(target) {
  return {
    discordId: target.profile.discordId,
    username: target.profile.username,
    displayName: target.profile.displayName,
  };
}

function validateCoupon(coupon) {
  if (!coupon || !coupon.active) return "Cupom inválido.";
  const now = new Date();
  if (coupon.validFrom && now < coupon.validFrom) return "Esse cupom ainda não está válido.";
  if (coupon.validUntil && now > coupon.validUntil) return "Esse cupom expirou.";
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return "Esse cupom já atingiu o limite de usos.";
  return null;
}