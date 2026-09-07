const { prisma } = require("../../../lib/prisma");
const { getSessionFromReq } = require("../../../lib/session");
const { generateUniqueOrderCode } = require("../../../lib/orderCode");

const MIN_PAYABLE_CENTS = 100;
const POINTS_PER_REAL = 10;

function moneyToCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function centsToMoney(cents) {
  return Math.round(cents) / 100;
}

function normalizeCouponCode(code) {
  if (typeof code !== "string") return "";
  return code.trim().toUpperCase().slice(0, 64);
}

function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) return "Carrinho vazio.";
  for (const it of items) {
    if (!it || typeof it.productId !== "string" || !Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 99) {
      return "Item de pedido inválido.";
    }
  }
  return null;
}

function normalizePoints(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return 0;
  return Math.min(n, 1_000_000);
}

async function getPricedItems(items) {
  const slugs = [...new Set(items.map((i) => i.productId))];
  const products = await prisma.product.findMany({ where: { slug: { in: slugs }, active: true } });
  const productBySlug = Object.fromEntries(products.map((p) => [p.slug, p]));
  const missing = slugs.filter((s) => !productBySlug[s]);
  if (missing.length > 0) throw new Error(`Produto indisponível: ${missing.join(", ")}`);

  let subtotalCents = 0;
  const orderItemsData = items.map((it) => {
    const product = productBySlug[it.productId];
    const unitPriceCents = moneyToCents(product.price);
    const lineTotalCents = unitPriceCents * it.quantity;
    subtotalCents += lineTotalCents;
    return {
      productId: product.id,
      nameSnapshot: product.name,
      unitPrice: centsToMoney(unitPriceCents),
      quantity: it.quantity,
      lineTotal: centsToMoney(lineTotalCents),
    };
  });

  return { subtotalCents, orderItemsData };
}

function validateCouponShape(coupon, now) {
  if (!coupon || !coupon.active) return { ok: false, error: "Cupom inválido ou inativo." };
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now.getTime()) {
    return { ok: false, error: "Este cupom ainda não está disponível." };
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < now.getTime()) {
    return { ok: false, error: "Este cupom já expirou." };
  }
  if (coupon.maxUses !== null && coupon.maxUses !== undefined && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, error: "Este cupom já atingiu o limite de usos." };
  }
  return { ok: true };
}

function calculateDiscount(subtotalCents, coupon, pointsToRedeem) {
  const minimumCents = subtotalCents > 0 ? Math.min(MIN_PAYABLE_CENTS, subtotalCents) : MIN_PAYABLE_CENTS;
  let couponDiscountCents = 0;

  if (coupon) {
    const value = moneyToCents(coupon.value);
    if (coupon.type === "PERCENT") {
      const pct = Math.max(0, Math.min(100, Number(coupon.value)));
      couponDiscountCents = Math.floor((subtotalCents * pct) / 100);
    } else {
      couponDiscountCents = Math.max(0, value);
    }
    couponDiscountCents = Math.min(couponDiscountCents, Math.max(0, subtotalCents - minimumCents));
  }

  const afterCouponCents = Math.max(minimumCents, subtotalCents - couponDiscountCents);
  const maxRedeemablePoints = Math.max(0, Math.floor(Math.max(0, afterCouponCents - minimumCents) / 10));
  const pointsUsed = Math.min(pointsToRedeem, maxRedeemablePoints);
  const pointsDiscountCents = pointsUsed * 10;
  const totalCents = Math.max(minimumCents, afterCouponCents - pointsDiscountCents);

  return {
    couponDiscountCents,
    pointsUsed,
    pointsDiscountCents,
    discountCents: couponDiscountCents + pointsDiscountCents,
    totalCents,
    pointsEarned: Math.floor(totalCents / 100),
  };
}

async function previewOrder({ items, couponCode, pointsToRedeem, userId }) {
  const validationError = validateItems(items);
  if (validationError) throw new Error(validationError);

  const { subtotalCents } = await getPricedItems(items);
  const pointsRequested = normalizePoints(pointsToRedeem);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { points: true } });
  if (!user) throw new Error("Usuário não encontrado.");

  let coupon = null;
  const normalizedCode = normalizeCouponCode(couponCode);
  if (normalizedCode) {
    coupon = await prisma.coupon.findUnique({ where: { code: normalizedCode } });
    const couponState = validateCouponShape(coupon, new Date());
    if (!couponState.ok) throw new Error(couponState.error);
  }

  const availablePoints = Math.max(0, user.points || 0);
  const requestedClamped = Math.min(pointsRequested, availablePoints);
  const calc = calculateDiscount(subtotalCents, coupon, requestedClamped);

  return {
    subtotal: centsToMoney(subtotalCents),
    couponCode: coupon?.code || null,
    couponDiscount: centsToMoney(calc.couponDiscountCents),
    pointsAvailable: availablePoints,
    pointsUsed: calc.pointsUsed,
    pointsDiscount: centsToMoney(calc.pointsDiscountCents),
    discountAmount: centsToMoney(calc.discountCents),
    total: centsToMoney(calc.totalCents),
    pointsEarned: calc.pointsEarned,
  };
}

export default async function handler(req, res) {
  const session = await getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: "Faça login para continuar." });

  if (req.method === "GET") {
    const orders = await prisma.order.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        subtotal: true,
        total: true,
        discountAmount: true,
        couponCode: true,
        pointsUsed: true,
        pointsEarned: true,
        status: true,
        createdAt: true,
        items: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            quantity: true,
            nameSnapshot: true,
            unitPrice: true,
            product: { select: { slug: true, name: true, active: true } },
          },
        },
      },
    });
    return res.status(200).json({
      orders: orders.map((o) => ({
        ...o,
        subtotal: Number(o.subtotal),
        total: Number(o.total),
        discountAmount: Number(o.discountAmount),
        items: o.items.map((i) => ({
          id: i.id,
          quantity: i.quantity,
          name: i.nameSnapshot || i.product?.name,
          unitPrice: Number(i.unitPrice),
          productId: i.product?.slug || null,
          active: i.product?.active ?? false,
        })),
      })),
    });
  }

  if (req.method === "POST") return createOrder(req, res, session);
  return res.status(405).json({ error: "Método não permitido" });
}

async function createOrder(req, res, session) {
  const body = req.body || {};
  const { items, idempotencyKey } = body;
  const couponCode = normalizeCouponCode(body.couponCode);
  const pointsToRedeem = normalizePoints(body.pointsToRedeem);

  const validationError = validateItems(items);
  if (validationError) return res.status(400).json({ error: validationError });

  if (idempotencyKey) {
    const existing = await prisma.order.findUnique({
      where: { idempotencyKey },
      select: { id: true, code: true, total: true, status: true, couponCode: true, discountAmount: true, pointsUsed: true, pointsEarned: true },
    });
    if (existing) return res.status(200).json({ order: { ...existing, total: Number(existing.total), discountAmount: Number(existing.discountAmount) } });
  }

  const blockingOrder = await prisma.order.findFirst({
    where: {
      userId: session.userId,
      status: { in: ["PENDING_PAYMENT", "PAYMENT_REVIEW", "PAID", "DELIVERING"] },
      OR: [{ ticket: null }, { ticket: { status: "OPEN" } }],
    },
    select: { code: true },
  });
  if (blockingOrder) {
    return res.status(409).json({
      error: `Você já tem um atendimento em aberto (pedido #${blockingOrder.code}). Finalize-o no Discord antes de fazer um novo pedido.`,
    });
  }

  let priced;
  try {
    priced = await getPricedItems(items);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const user = await tx.user.findUnique({ where: { id: session.userId }, select: { id: true, points: true } });
      if (!user) throw new Error("Usuário não encontrado.");

      let coupon = null;
      if (couponCode) {
        coupon = await tx.coupon.findUnique({ where: { code: couponCode } });
        const couponState = validateCouponShape(coupon, now);
        if (!couponState.ok) throw new Error(couponState.error);
      }

      const pointsRequested = Math.min(pointsToRedeem, Math.max(0, user.points || 0));
      const calc = calculateDiscount(priced.subtotalCents, coupon, pointsRequested);

      // Consome o cupom e os pontos dentro da mesma transação do pedido.
      // As condições do UPDATE protegem o limite de uso e o saldo contra corrida.
      if (coupon) {
        const couponUpdate = await tx.coupon.updateMany({
          where: {
            id: coupon.id,
            active: true,
            ...(coupon.maxUses === null || coupon.maxUses === undefined ? {} : { usedCount: { lt: coupon.maxUses } }),
          },
          data: { usedCount: { increment: 1 } },
        });
        if (couponUpdate.count !== 1) throw new Error("Este cupom acabou de atingir o limite de usos. Tente outro.");
      }

      if (calc.pointsUsed > 0) {
        const userUpdate = await tx.user.updateMany({
          where: { id: user.id, points: { gte: calc.pointsUsed } },
          data: { points: { decrement: calc.pointsUsed } },
        });
        if (userUpdate.count !== 1) throw new Error("Seu saldo de pontos mudou. Atualize e tente novamente.");
      }

      const code = await generateUniqueOrderCode(tx);
      return tx.order.create({
        data: {
          code,
          idempotencyKey: idempotencyKey || undefined,
          userId: session.userId,
          subtotal: centsToMoney(priced.subtotalCents),
          total: centsToMoney(calc.totalCents),
          couponCode: coupon?.code || null,
          discountAmount: centsToMoney(calc.discountCents),
          pointsUsed: calc.pointsUsed,
          pointsEarned: calc.pointsEarned,
          items: { create: priced.orderItemsData },
        },
        include: { items: true, user: true },
      });
    }, { isolationLevel: "Serializable" });
  } catch (e) {
    if (idempotencyKey) {
      const existing = await prisma.order.findUnique({ where: { idempotencyKey } });
      if (existing) return res.status(200).json({ order: { ...existing, total: Number(existing.total), discountAmount: Number(existing.discountAmount) } });
    }
    console.error("Erro ao criar pedido:", e);
    return res.status(400).json({ error: e.message || "Não foi possível criar o pedido." });
  }

  return res.status(201).json({
    order: {
      id: order.id,
      code: order.code,
      subtotal: Number(order.subtotal),
      total: Number(order.total),
      discountAmount: Number(order.discountAmount),
      couponCode: order.couponCode,
      pointsUsed: order.pointsUsed,
      pointsEarned: order.pointsEarned,
      status: order.status,
    },
  });
}