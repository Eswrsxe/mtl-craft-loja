const { prisma } = require("../../../../lib/prisma");
const { getSessionFromReq } = require("../../../../lib/session");
const { isAdminSession, getAdminIds } = require("../../../../lib/adminAuth");
const { isValidDiscordId } = require("../../../../lib/discordMember");
const { describeDbError } = require("../../../../lib/dbError");

// /api/admin/invites/lookup?discordId=... — só para admins.
// Confere SÓ se esse ID já tem conta no site (já logou com Discord alguma
// vez) — não confunde com "está no servidor do Discord" (isso é outra
// verificação, usada em /admin/pedido). É essa checagem que decide se dá
// pra convidar a pessoa pro admin do site agora ou se ela precisa logar
// primeiro.
export default async function handler(req, res) {
  const session = await getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: "Faça login para continuar." });
  if (!(await isAdminSession(session))) return res.status(403).json({ error: "Acesso restrito à equipe." });

  if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido" });

  const discordId = String(req.query.discordId || "").trim();
  if (!isValidDiscordId(discordId)) {
    return res.status(400).json({ error: "Informe um ID do Discord válido (17 a 20 números)." });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { discordId },
      select: { discordId: true, username: true, avatar: true },
    });
    if (!user) {
      return res.status(404).json({
        error: "Essa pessoa ainda não entrou no site com a conta do Discord. Ela precisa logar pelo menos uma vez antes de ser convidada.",
      });
    }

    const isFixedAdmin = getAdminIds().includes(discordId);
    const grant = await prisma.adminGrant.findUnique({ where: { discordId } });

    return res.status(200).json({
      user,
      isFixedAdmin,
      grantStatus: grant?.status || null, // null | "PENDING" | "ACCEPTED" | "DECLINED"
    });
  } catch (e) {
    console.error("Erro em /api/admin/invites/lookup:", e);
    return res.status(500).json({ error: describeDbError(e, "20260925160000_admin_grants") });
  }
}