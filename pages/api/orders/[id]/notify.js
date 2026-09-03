const { prisma } = require("../../../../lib/prisma");
const { getSessionFromReq } = require("../../../../lib/session");
const { notifyBotOfNewOrder } = require("../../../../lib/botClient");

// Reenvia o pedido para o bot (DM com botão "Abrir atendimento"). Existe
// para o caso do bot estar offline no momento em que o pedido foi criado:
// o pedido já está salvo no banco (nunca se perde), e o cliente pode pedir
// para tentar de novo pela tela "Minha conta" assim que o bot voltar.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  const session = await getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: "Faça login para continuar." });

  const { id } = req.query;
  const order = await prisma.order.findUnique({
    where: { id: String(id) },
    include: { items: true, user: true },
  });

  if (!order) return res.status(404).json({ error: "Pedido não encontrado." });
  if (order.userId !== session.userId) return res.status(403).json({ error: "Acesso negado." });

  try {
    await notifyBotOfNewOrder(order);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(`Falha ao reenviar pedido ${order.id} ao bot:`, e);
    return res.status(502).json({ error: "O bot está indisponível no momento. Tente novamente em instantes." });
  }
}
