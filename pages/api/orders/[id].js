const { prisma } = require("../../../lib/prisma");
const { getSessionFromReq } = require("../../../lib/session");

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido" });

  const session = await getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: "Faça login para continuar." });

  const { id } = req.query;
  const order = await prisma.order.findUnique({
    where: { id: String(id) },
    include: { items: true },
  });

  if (!order) return res.status(404).json({ error: "Pedido não encontrado." });
  // Proteção contra usuário acessar pedido de outra conta.
  if (order.userId !== session.userId) return res.status(403).json({ error: "Acesso negado." });

  return res.status(200).json({ order });
}
