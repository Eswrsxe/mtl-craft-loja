const { generateAuthenticationOptions } = require("@simplewebauthn/server");
const { prisma } = require("../../../lib/prisma");
const { rpConfig, saveChallenge, cleanupExpiredChallenges } = require("../../../lib/webauthn");

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  await cleanupExpiredChallenges(prisma);
  const { rpID } = rpConfig();

  // Sem "allowCredentials": o navegador deixa o usuário escolher, entre as
  // Passkeys salvas no dispositivo/gerenciador, qual usar (resident key).
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
  });

  await saveChallenge(prisma, { challenge: options.challenge, type: "AUTHENTICATION" });

  return res.status(200).json(options);
}
