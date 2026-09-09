const { prisma } = require("../../../lib/prisma");
const { getSessionFromReq } = require("../../../lib/session");
const { isAdminSession } = require("../../../lib/adminAuth");

export default async function handler(req, res) {
  const session = await getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: "Faça login para continuar." });
  if (!isAdminSession(session)) return res.status(403).json({ error: "Acesso restrito à equipe." });

  if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido" });

  const orders = await prisma.order.findMany({
    where: {
      OR: [{ approvedBy: { not: null } }, { rejectedBy: { not: null } }, { deliveredBy: { not: null } }],
    },
    select: {
      code: true,
      total: true,
      status: true,
      approvedBy: true,
      approvedAt: true,
      rejectedBy: true,
      rejectedAt: true,
      deliveredBy: true,
      deliveredAt: true,
      user: { select: { username: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  // Achata em uma lista de "eventos" (1 pedido pode ter até 3: aprovou,
  // recusou, entregou) já ordenada do mais recente pro mais antigo.
  const events = [];
  for (const o of orders) {
    if (o.approvedBy) {
      events.push({ type: "APROVOU", staff: o.approvedBy, at: o.approvedAt, orderCode: o.code, buyer: o.user.username, total: o.total });
    }
    if (o.rejectedBy) {
      events.push({ type: "RECUSOU", staff: o.rejectedBy, at: o.rejectedAt, orderCode: o.code, buyer: o.user.username, total: o.total });
    }
    if (o.deliveredBy) {
      events.push({ type: "ENTREGOU", staff: o.deliveredBy, at: o.deliveredAt, orderCode: o.code, buyer: o.user.username, total: o.total });
    }
  }
  events.sort((a, b) => new Date(b.at) - new Date(a.at));

  return res.status(200).json({ events: events.slice(0, 150) });
}
