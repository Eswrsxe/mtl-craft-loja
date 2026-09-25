const { prisma } = require("../../../../lib/prisma");
const { getSessionFromReq } = require("../../../../lib/session");
const { isAdminSession } = require("../../../../lib/adminAuth");
const { describeDbError } = require("../../../../lib/dbError");

// /api/admin/invites/[id] — só para quem já é admin.
//   DELETE -> cancela um convite pendente OU remove o acesso de admin de
//             quem tinha aceitado (some com a linha; ela pode ser
//             reconvidada depois, do zero).
export default async function handler(req, res) {
  const session = await getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: "Faça login para continuar." });
  if (!(await isAdminSession(session))) return res.status(403).json({ error: "Acesso restrito à equipe." });

  if (req.method !== "DELETE") return res.status(405).json({ error: "Método não permitido" });

  const { id } = req.query;
  try {
    const grant = await prisma.adminGrant.findUnique({ where: { id } });
    if (!grant) return res.status(404).json({ error: "Convite não encontrado." });

    await prisma.adminGrant.delete({ where: { id } });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Erro em /api/admin/invites/[id]:", e);
    return res.status(500).json({ error: describeDbError(e, "20260925160000_admin_grants") });
  }
}