const { prisma } = require("../../../../lib/prisma");
const { getSessionFromReq } = require("../../../../lib/session");

// /api/admin/invites/respond — QUALQUER pessoa logada aceita ou recusa o
// PRÓPRIO convite de admin (sem precisar já ser admin — ver nota em me.js).
// Aceitar dá acesso ao painel /admin do site (nunca mexe em cargo/permissão
// dentro do servidor do Discord).
export default async function handler(req, res) {
  const session = await getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: "Faça login para continuar." });

  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  const action = req.body?.action;
  if (action !== "accept" && action !== "decline") {
    return res.status(400).json({ error: "Ação inválida (use accept ou decline)." });
  }

  const invite = await prisma.adminGrant.findUnique({ where: { discordId: session.discordId } });
  if (!invite) return res.status(404).json({ error: "Você não tem nenhum convite." });
  if (invite.status !== "PENDING") {
    return res.status(409).json({ error: "Esse convite já foi respondido." });
  }

  const updated = await prisma.adminGrant.update({
    where: { discordId: session.discordId },
    data: { status: action === "accept" ? "ACCEPTED" : "DECLINED", respondedAt: new Date() },
  });

  return res.status(200).json({ invite: updated });
}