const { prisma } = require("../../../lib/prisma");
const { getSessionFromReq } = require("../../../lib/session");
const { isAdminSession } = require("../../../lib/adminAuth");

// "Faturamento" conta pedidos que passaram por aprovação de pagamento
// (PAID, DELIVERING, COMPLETED) — PENDING_PAYMENT/PAYMENT_REVIEW ainda não
// é dinheiro confirmado, e CANCELLED não conta.
const REVENUE_STATUSES = ["PAID", "DELIVERING", "COMPLETED"];

export default async function handler(req, res) {
  const session = await getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: "Faça login para continuar." });
  if (!isAdminSession(session)) return res.status(403).json({ error: "Acesso restrito à equipe." });

  if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido" });

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [revenueDay, revenueWeek, revenueMonth, openTicketsCount, approvedOrders, topItemsRaw] = await Promise.all([
    prisma.order.aggregate({
      where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: startOfDay } },
      _sum: { total: true },
    }),
    prisma.order.aggregate({
      where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: startOfWeek } },
      _sum: { total: true },
    }),
    prisma.order.aggregate({
      where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: startOfMonth } },
      _sum: { total: true },
    }),
    prisma.ticket.count({ where: { status: "OPEN" } }),
    prisma.order.findMany({
      where: { approvedAt: { not: null } },
      select: { createdAt: true, approvedAt: true },
      take: 500,
      orderBy: { approvedAt: "desc" },
    }),
    prisma.orderItem.groupBy({
      by: ["nameSnapshot"],
      where: { order: { status: { in: REVENUE_STATUSES } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 8,
    }),
  ]);

  let avgApprovalMinutes = null;
  if (approvedOrders.length > 0) {
    const totalMs = approvedOrders.reduce((acc, o) => acc + (new Date(o.approvedAt) - new Date(o.createdAt)), 0);
    avgApprovalMinutes = Math.round(totalMs / approvedOrders.length / 60000);
  }

  return res.status(200).json({
    revenue: {
      day: Number(revenueDay._sum.total || 0),
      week: Number(revenueWeek._sum.total || 0),
      month: Number(revenueMonth._sum.total || 0),
    },
    openTickets: openTicketsCount,
    avgApprovalMinutes,
    topItems: topItemsRaw.map((i) => ({ name: i.nameSnapshot, quantity: i._sum.quantity })),
  });
}
