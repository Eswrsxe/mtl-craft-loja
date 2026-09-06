const { prisma } = require("../../../lib/prisma");
const { getSessionFromReq } = require("../../../lib/session");
const { generateUniqueOrderCode } = require("../../../lib/orderCode");

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

  // Regra: só pode existir 1 atendimento (ticket) em aberto por vez por
  // comprador. Bloqueia aqui um novo pedido enquanto o anterior ainda está
  // em andamento — seja porque o ticket ainda não foi criado pelo watcher,
  // seja porque o ticket já existe e continua aberto no Discord.
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

  // Não é preciso avisar o bot por HTTP: o orderWatcher do bot consulta o
  // Neon a cada 5s por pedidos PENDING_PAYMENT sem ticket e cria o
  // atendimento sozinho. O pedido já está salvo — é só aguardar o watcher.

  return res.status(201).json({
    order: { id: order.id, code: order.code, total: order.total, status: order.status },
  });
}