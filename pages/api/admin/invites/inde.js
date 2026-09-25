const { prisma } = require("../../../../lib/prisma");
const { getSessionFromReq } = require("../../../../lib/session");
const { isAdminSession, getAdminIds } = require("../../../../lib/adminAuth");
const { isValidDiscordId } = require("../../../../lib/discordMember");
const { describeDbError } = require("../../../../lib/dbError");

// /api/admin/invites — só para quem já é admin.
//   GET  -> lista todos os convites já feitos (pendente/aceito/recusado).
//   POST -> convida um novo Discord ID pro admin do site. A pessoa PRECISA
//           já ter uma conta (já ter logado com Discord no site) — senão
//           não dá pra convidar ainda.
export default async function handler(req, res) {
  const session = await getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: "Faça login para continuar." });
  if (!(await isAdminSession(session))) return res.status(403).json({ error: "Acesso restrito à equipe." });

  try {
    return await handleInvites(req, res, session);
  } catch (e) {
    console.error("Erro em /api/admin/invites:", e);
    return res.status(500).json({ error: describeDbError(e, "20260925160000_admin_grants") });
  }
}

async function handleInvites(req, res, session) {
  if (req.method === "GET") {
    const invites = await prisma.adminGrant.findMany({ orderBy: { createdAt: "desc" } });
    const discordIds = invites.map((i) => i.discordId);
    const users = await prisma.user.findMany({
      where: { discordId: { in: discordIds } },
      select: { discordId: true, username: true, avatar: true },
    });
    const byId = Object.fromEntries(users.map((u) => [u.discordId, u]));
    return res.status(200).json({
      invites: invites.map((i) => ({ ...i, user: byId[i.discordId] || null })),
    });
  }

  if (req.method === "POST") {
    const discordId = String(req.body?.discordId || "").trim();
    if (!isValidDiscordId(discordId)) {
      return res.status(400).json({ error: "Informe um ID do Discord válido (17 a 20 números)." });
    }

    if (getAdminIds().includes(discordId)) {
      return res.status(409).json({ error: "Essa pessoa já é admin fixo (está em ADMIN_DISCORD_IDS)." });
    }

    const targetUser = await prisma.user.findUnique({ where: { discordId } });
    if (!targetUser) {
      return res.status(404).json({
        error: "Essa pessoa ainda não entrou no site com a conta do Discord. Ela precisa logar pelo menos uma vez antes de ser convidada.",
      });
    }

    const existing = await prisma.adminGrant.findUnique({ where: { discordId } });
    if (existing?.status === "ACCEPTED") {
      return res.status(409).json({ error: "Essa pessoa já é admin do site." });
    }
    if (existing?.status === "PENDING") {
      return res.status(409).json({ error: "Já existe um convite pendente pra essa pessoa." });
    }

    const invite = await prisma.adminGrant.upsert({
      where: { discordId },
      update: { status: "PENDING", invitedBy: session.discordId, respondedAt: null },
      create: { discordId, status: "PENDING", invitedBy: session.discordId },
    });

    return res.status(200).json({ invite: { ...invite, user: targetUser } });
  }

  return res.status(405).json({ error: "Método não permitido" });
}