const { prisma } = require("../../../lib/prisma");
const { getSessionFromReq } = require("../../../lib/session");
const { generateUniqueOrderCode } = require("../../../lib/orderCode");
const { notifyBotOfNewOrder } = require("../../../lib/botClient");

export default async function handler(req, res) {
  const session = await getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: "Faça login para continuar." });

  if (req.method === "GET") {
    const orders = await prisma.order.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true, total: true, status: true, createdAt: true },
    });
    return res.status(200).json({ orders });
  }

  if (req.method === "POST") {
    return createOrder(req, res, session);
  }

  return res.status(405).json({ error: "Método não permitido" });
}

async function createOrder(req, res, session) {
  const { items, idempotencyKey } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Carrinho vazio." });
  }
  for (const it of items) {
    if (!it || typeof it.productId !== "string" || !Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 99) {
      return res.status(400).json({ error: "Item de pedido inválido." });
    }
  }

  // Reaproveita o pedido já criado se o mesmo clique tiver sido reenviado
  // (duplo clique / retry de rede) — protege contra pedido duplicado.
  if (idempotencyKey) {
    const existing = await prisma.order.findUnique({
      where: { idempotencyKey },
      select: { id: true, code: true, total: true, status: true },
    });
    if (existing) return res.status(200).json({ order: existing });
  }

  // NUNCA confiar em preço/subtotal/total vindos do cliente — buscamos o
  // produto real e o preço real no banco (ver seção 11 do pedido original).
  const slugs = [...new Set(items.map((i) => i.productId))];
  const products = await prisma.product.findMany({ where: { slug: { in: slugs }, active: true } });
  const productBySlug = Object.fromEntries(products.map((p) => [p.slug, p]));

  const missing = slugs.filter((s) => !productBySlug[s]);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Produto indisponível: ${missing.join(", ")}` });
  }

  let total = 0;
  const orderItemsData = items.map((it) => {
    const product = productBySlug[it.productId];
    const unitPrice = Number(product.price);
    const lineTotal = Math.round(unitPrice * it.quantity * 100) / 100;
    total += lineTotal;
    return {
      productId: product.id,
      nameSnapshot: product.name,
      unitPrice,
      quantity: it.quantity,
      lineTotal,
    };
  });
  total = Math.round(total * 100) / 100;

  const code = await generateUniqueOrderCode(prisma);

  let order;
  try {
    order = await prisma.order.create({
      data: {
        code,
        idempotencyKey: idempotencyKey || undefined,
        userId: session.userId,
        subtotal: total,
        total,
        items: { create: orderItemsData },
      },
      include: { items: true, user: true },
    });
  } catch (e) {
    // Corrida rara em cima da mesma idempotencyKey: devolve o pedido já criado.
    if (idempotencyKey) {
      const existing = await prisma.order.findUnique({ where: { idempotencyKey } });
      if (existing) return res.status(200).json({ order: existing });
    }
    console.error("Erro ao criar pedido:", e);
    return res.status(500).json({ error: "Não foi possível criar o pedido." });
  }

  try {
    await notifyBotOfNewOrder(order);
  } catch (e) {
    // O pedido já existe no banco; se o bot estiver fora do ar, o ADM
    // consegue ver e reenviar depois. Não derruba a resposta ao cliente.
    console.error("Falha ao avisar o bot sobre o novo pedido:", e);
  }

  return res.status(201).json({
    order: { id: order.id, code: order.code, total: order.total, status: order.status },
  });
}
