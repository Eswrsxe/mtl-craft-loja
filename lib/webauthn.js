const CHALLENGE_TTL_MS = 2 * 60 * 1000; // 2 minutos — proteção contra replay/challenge velho

function rpConfig() {
  const rpID = process.env.WEBAUTHN_RP_ID;
  const origin = process.env.WEBAUTHN_ORIGIN;
  if (!rpID || !origin) {
    throw new Error("Configure WEBAUTHN_RP_ID e WEBAUTHN_ORIGIN no .env");
  }
  return { rpID, rpName: "MTL CRAFT", origin };
}

async function saveChallenge(prisma, { userId = null, challenge, type }) {
  return prisma.webAuthnChallenge.create({
    data: {
      userId,
      challenge,
      type,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  });
}

// Busca e IMEDIATAMENTE apaga o challenge (uso único = anti-replay). Rejeita
// se estiver expirado.
async function consumeChallenge(prisma, { challenge, type, userId = null }) {
  const record = await prisma.webAuthnChallenge.findFirst({
    where: { challenge, type, ...(userId ? { userId } : {}) },
    orderBy: { createdAt: "desc" },
  });
  if (!record) return null;
  await prisma.webAuthnChallenge.delete({ where: { id: record.id } }).catch(() => {});
  if (record.expiresAt.getTime() < Date.now()) return null;
  return record;
}

async function cleanupExpiredChallenges(prisma) {
  await prisma.webAuthnChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
}

module.exports = { rpConfig, saveChallenge, consumeChallenge, cleanupExpiredChallenges };
