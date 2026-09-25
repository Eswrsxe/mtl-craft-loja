const { prisma } = require("../../../../lib/prisma");
const { getSessionFromReq } = require("../../../../lib/session");

// /api/admin/invites/me — QUALQUER pessoa logada (não precisa ser admin
// ainda) consulta se ela tem um convite de admin pendente/já respondido. É
// o que alimenta o aviso "você foi convidado" em /admin/log. Apesar do
// caminho começar com /admin/, essa rota NÃO exige ser admin — de propósito,
// pra quem ainda não é admin conseguir ver e responder o próprio convite.
export default async function handler(req, res) {
  const session = await getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: "Faça login para continuar." });

  if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido" });

  const invite = await prisma.adminGrant.findUnique({ where: { discordId: session.discordId } });
  return res.status(200).json({ invite: invite || null });
}