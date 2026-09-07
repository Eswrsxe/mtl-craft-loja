const { prisma } = require("../../../../lib/prisma");
const { getSessionFromReq } = require("../../../../lib/session");
const { isAdminSession } = require("../../../../lib/adminAuth");

export default async function handler(req, res) {
  const session = await getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: "Faça login para continuar." });
  if (!isAdminSession(session)) return res.status(403).json({ error: "Acesso restrito à equipe." });

  const { id } = req.query;

  if (req.method === "PATCH") {
    const { active } = req.body || {};
    if (typeof active !== "boolean") {
      return res.status(400).json({ error: "Campo 'active' precisa ser true ou false." });
    }
    try {
      const coupon = await prisma.coupon.update({ where: { id }, data: { active } });
      return res.status(200).json({ coupon });
    } catch (e) {
      return res.status(404).json({ error: "Cupom não encontrado." });
    }
  }

  if (req.method === "DELETE") {
    try {
      await prisma.coupon.delete({ where: { id } });
      return res.status(204).end();
    } catch (e) {
      return res.status(404).json({ error: "Cupom não encontrado." });
    }
  }

  return res.status(405).json({ error: "Método não permitido" });
}
