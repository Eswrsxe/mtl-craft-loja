const { prisma } = require("../../../lib/prisma");
const { getSessionFromReq } = require("../../../lib/session");

function moneyToCents(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function centsToMoney(cents) { return Math.round(cents) / 100; }
function normalizeCouponCode(code) { return typeof code === "string" ? code.trim().toUpperCase().slice(0, 64) : ""; }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });
  const session = await getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: "Faça login para continuar." });

  const { items, couponCode, pointsToRedeem = 0 } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "Carrinho vazio." });
  const code = normalizeCouponCode(couponCode);
  if (!code) return res.status(400).json({ error: "Informe um cupom." });

  try {
    const [coupon, user] = await Promise.all([
      prisma.coupon.findUnique({ where: { code } }),
      prisma.user.findUnique({ where: { id: session.userId }, select: { points: true } }),
    ]);
    const now = new Date();
    if (!coupon || !coupon.active) return res.status(400).json({ error: "Cupom inválido ou inativo." });
    if (coupon.startsAt && new Date(coupon.startsAt) > now) return res.status(400).json({ error: "Este cupom ainda não está disponível." });
    if (coupon.expiresAt && new Date(coupon.expiresAt) < now) return res.status(400).json({ error: "Este cupom já expirou." });
    if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) return res.status(400).json({ error: "Este cupom já atingiu o limite de usos." });

    const slugs = [...new Set(items.map((i) => i?.productId))];
    const products = await prisma.product.findMany({ where: { slug: { in: slugs }, active: true }, select: { slug: true, price: true } });
    const bySlug = Object.fromEntries(products.map((p) => [p.slug, p]));
    const missing = slugs.filter((s) => !bySlug[s]);
    if (missing.length) return res.status(400).json({ error: `Produto indisponível: ${missing.join(", ")}` });

    let subtotalCents = 0;
    for (const item of items) {
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) return res.status(400).json({ error: "Item de pedido inválido." });
      subtotalCents += moneyToCents(bySlug[item.productId].price) * item.quantity;
    }

    const minimumCents = subtotalCents > 0 ? Math.min(100, subtotalCents) : 100;
    let couponDiscountCents = coupon.type === "PERCENT"
      ? Math.floor((subtotalCents * Math.max(0, Math.min(100, Number(coupon.value)))) / 100)
      : Math.max(0, moneyToCents(coupon.value));
    couponDiscountCents = Math.min(couponDiscountCents, Math.max(0, subtotalCents - minimumCents));
    const afterCoupon = Math.max(minimumCents, subtotalCents - couponDiscountCents);
    const availablePoints = Math.max(0, user?.points || 0);
    const requested = Number.isInteger(pointsToRedeem) && pointsToRedeem > 0 ? Math.min(pointsToRedeem, availablePoints) : 0;
    const pointsUsed = Math.min(requested, Math.floor(Math.max(0, afterCoupon - minimumCents) / 10));
    const pointsDiscountCents = pointsUsed * 10;
    const totalCents = Math.max(minimumCents, afterCoupon - pointsDiscountCents);

    return res.status(200).json({
      couponCode: coupon.code,
      subtotal: centsToMoney(subtotalCents),
      couponDiscount: centsToMoney(couponDiscountCents),
      pointsAvailable: availablePoints,
      pointsUsed,
      pointsDiscount: centsToMoney(pointsDiscountCents),
      discountAmount: centsToMoney(couponDiscountCents + pointsDiscountCents),
      total: centsToMoney(totalCents),
      pointsEarned: Math.floor(totalCents / 100),
    });
  } catch (e) {
    console.error("Erro ao validar cupom:", e);
    return res.status(500).json({ error: "Não foi possível validar o cupom." });
  }
}