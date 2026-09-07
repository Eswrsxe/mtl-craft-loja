const { prisma } = require("../../../lib/prisma");
const { getSessionFromReq } = require("../../../lib/session");

export default async function handler(req, res) {
  const session = await getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: "Faça login para continuar." });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { code, subtotal } = req.body || {};
  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Informe um código de cupom." });
  }
  const parsedSubtotal = Number(subtotal);
  if (!Number.isFinite(parsedSubtotal) || parsedSubtotal <= 0) {
    return res.status(400).json({ error: "Subtotal inválido." });
  }

  const coupon = await prisma.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });

  const now = new Date();
  if (!coupon || !coupon.active) return res.status(400).json({ error: "Cupom inválido." });
  if (coupon.validFrom && now < coupon.validFrom) return res.status(400).json({ error: "Esse cupom ainda não está válido." });
  if (coupon.validUntil && now > coupon.validUntil) return res.status(400).json({ error: "Esse cupom expirou." });
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return res.status(400).json({ error: "Esse cupom já atingiu o limite de usos." });
  }

  let discountAmount =
    coupon.discountType === "PERCENT" ? (parsedSubtotal * Number(coupon.discountValue)) / 100 : Number(coupon.discountValue);
  discountAmount = Math.min(discountAmount, Math.max(0, parsedSubtotal - 1));
  discountAmount = Math.round(discountAmount * 100) / 100;

  return res.status(200).json({
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: Number(coupon.discountValue),
    discountAmount,
  });
}