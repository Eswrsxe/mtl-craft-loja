const { prisma } = require("../../../lib/prisma");
const { getSessionFromReq } = require("../../../lib/session");
const { isAdminSession } = require("../../../lib/adminAuth");

const VALID_TYPES = ["PERCENT", "FIXED"];

export default async function handler(req, res) {
  const session = await getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: "Faça login para continuar." });
  if (!isAdminSession(session)) return res.status(403).json({ error: "Acesso restrito à equipe." });

  if (req.method === "GET") {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
    return res.status(200).json({ coupons });
  }

  if (req.method === "POST") {
    const { code, discountType, discountValue, maxUses, validFrom, validUntil } = req.body || {};

    if (!code || typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ error: "Informe um código pro cupom." });
    }
    if (!VALID_TYPES.includes(discountType)) {
      return res.status(400).json({ error: "Tipo de desconto inválido." });
    }
    const value = Number(discountValue);
    if (!Number.isFinite(value) || value <= 0) {
      return res.status(400).json({ error: "Valor do desconto inválido." });
    }
    if (discountType === "PERCENT" && value > 100) {
      return res.status(400).json({ error: "Desconto percentual não pode passar de 100%." });
    }
    let parsedMaxUses = null;
    if (maxUses !== null && maxUses !== undefined && maxUses !== "") {
      parsedMaxUses = Number(maxUses);
      if (!Number.isInteger(parsedMaxUses) || parsedMaxUses < 1) {
        return res.status(400).json({ error: "Limite de usos inválido." });
      }
    }

    try {
      const coupon = await prisma.coupon.create({
        data: {
          code: code.trim().toUpperCase(),
          discountType,
          discountValue: value,
          maxUses: parsedMaxUses,
          validFrom: validFrom ? new Date(validFrom) : null,
          validUntil: validUntil ? new Date(validUntil) : null,
        },
      });
      return res.status(201).json({ coupon });
    } catch (e) {
      if (e.code === "P2002") {
        return res.status(409).json({ error: "Já existe um cupom com esse código." });
      }
      console.error("Erro ao criar cupom:", e);
      return res.status(500).json({ error: "Não foi possível criar o cupom." });
    }
  }

  return res.status(405).json({ error: "Método não permitido" });
}
