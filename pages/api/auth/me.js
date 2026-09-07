const { prisma } = require("../../../lib/prisma");
const { getSessionFromReq } = require("../../../lib/session");

export default async function handler(req, res) {
  const session = await getSessionFromReq(req);
  if (!session) return res.status(200).json({ user: null });

  try {
    let user;
    try {
      // Versão normal: inclui pontos, usados pela fidelidade.
      user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: {
          id: true,
          discordId: true,
          username: true,
          avatar: true,
          points: true,
          _count: { select: { passkeys: true } },
        },
      });
    } catch (schemaError) {
      // Compatibilidade temporária: se a Vercel ainda estiver com o banco
      // anterior à migration de pontos, o login não pode ficar quebrado.
      // Retornamos o usuário com 0 pontos; a migration ainda deve ser aplicada
      // antes de usar os recursos de fidelidade/pontos no checkout.
      console.error("Falha ao ler pontos; usando fallback compatível:", schemaError);
      user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: {
          id: true,
          discordId: true,
          username: true,
          avatar: true,
          _count: { select: { passkeys: true } },
        },
      });
      if (user) user.points = 0;
    }

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
