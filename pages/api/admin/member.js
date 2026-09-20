const { prisma } = require("../../../lib/prisma");
const { getSessionFromReq } = require("../../../lib/session");
const { isAdminSession } = require("../../../lib/adminAuth");
const { isValidDiscordId, resolveTargetMember } = require("../../../lib/discordMember");

// Confere quem é o dono de um ID do Discord (e se está no servidor) antes de
// abrir um pedido no nome dele. Só para admins.
export default async function handler(req, res) {
  const session = await getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: "Faça login para continuar." });
  if (!isAdminSession(session)) return res.status(403).json({ error: "Acesso restrito à equipe." });

  if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido" });

  const id = String(req.query.id || "").trim();
  if (!isValidDiscordId(id)) {
    return res.status(400).json({ error: "Informe um ID do Discord válido (17 a 20 números)." });
  }

  const target = await resolveTargetMember(prisma, id);
  if (!target.ok) return res.status(target.status).json({ error: target.error });

  return res.status(200).json({
    member: {
      discordId: target.profile.discordId,
      username: target.profile.username,
      displayName: target.profile.displayName,
      avatarUrl: target.profile.avatarUrl,
      verified: target.verified,
    },
  });
}