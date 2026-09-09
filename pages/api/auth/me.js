const { prisma } = require("../../../lib/prisma");
const { getSessionFromReq } = require("../../../lib/session");

export default async function handler(req, res) {
  const session = await getSessionFromReq(req);
  if (!session) return res.status(200).json({ user: null });

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        discordId: true,
        username: true,
        avatar: true,
        _count: { select: { passkeys: true } },
      },
    });

    if (!user) return res.status(200).json({ user: null });

    const { _count, ...rest } = user;
    return res.status(200).json({
      user: { ...rest, hasPasskey: _count.passkeys > 0 },
    });
  } catch (e) {
    // Falha temporária ao consultar o banco (ex.: Neon momentaneamente
    // indisponível). Isso NÃO significa que o usuário está deslogado: a
    // sessão (cookie) continua válida, só não conseguimos confirmar os
    // dados agora. Respondemos sempre 200 e sinalizamos "authError" para o
    // frontend não apagar o usuário silenciosamente (ver AuthProvider).
    console.error("Erro ao consultar usuário em /api/auth/me:", e);
    return res.status(200).json({ user: null, authError: true });
  }
}