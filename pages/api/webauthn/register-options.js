const { generateRegistrationOptions } = require("@simplewebauthn/server");
const { prisma } = require("../../../lib/prisma");
const { getSessionFromReq } = require("../../../lib/session");
const { rpConfig, saveChallenge, cleanupExpiredChallenges } = require("../../../lib/webauthn");

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  const session = await getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: "Faça login antes de cadastrar uma Passkey." });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { passkeys: true },
  });
  if (!user) return res.status(401).json({ error: "Usuário não encontrado." });

  await cleanupExpiredChallenges(prisma);
  const { rpID, rpName } = rpConfig();

  const options = await generateRegistrationOptions({
    rpID,
    rpName,
    userID: Buffer.from(user.id),
    userName: user.username,
    attestationType: "none",
    excludeCredentials: user.passkeys.map((p) => ({
      id: p.credentialId,
      transports: p.transports,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  await saveChallenge(prisma, { userId: user.id, challenge: options.challenge, type: "REGISTRATION" });

  return res.status(200).json(options);
}
