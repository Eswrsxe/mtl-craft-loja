const { verifyRegistrationResponse } = require("@simplewebauthn/server");
const { prisma } = require("../../../lib/prisma");
const { getSessionFromReq } = require("../../../lib/session");
const { rpConfig, consumeChallenge } = require("../../../lib/webauthn");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido",
    });
  }

  try {
    const session = await getSessionFromReq(req);

    if (!session) {
      return res.status(401).json({
        error: "Sessão expirada.",
      });
    }

    const { rpID, origin } = rpConfig();
    const attestationResponse = req.body;

    console.log("========== WEBAUTHN REGISTER ==========");
    console.log("RP ID:", rpID);
    console.log("Origin esperado:", origin);
    console.log("Credential ID recebido:", attestationResponse?.id);
    console.log("Credential type:", attestationResponse?.type);
    console.log("=======================================");

    if (!attestationResponse?.id) {
      return res.status(400).json({
        error: "Resposta WebAuthn inválida: ID da credencial ausente.",
      });
    }

    if (!attestationResponse?.response?.clientDataJSON) {
      return res.status(400).json({
        error: "Resposta WebAuthn inválida: clientDataJSON ausente.",
      });
    }

    /*
     * Recupera o challenge enviado anteriormente.
     */
    let clientDataJSON;

    try {
      clientDataJSON = JSON.parse(
        Buffer.from(
          attestationResponse.response.clientDataJSON,
          "base64url"
        ).toString("utf8")
      );
    } catch (e) {
      console.error("Erro ao decodificar clientDataJSON:", e);

      return res.status(400).json({
        error: "clientDataJSON inválido.",
      });
    }

    console.log("Challenge recebido:", clientDataJSON.challenge);

    const challengeRecord = await consumeChallenge(prisma, {
      challenge: clientDataJSON.challenge,
      type: "REGISTRATION",
      userId: session.userId,
    });

    if (!challengeRecord) {
      console.error("❌ CHALLENGE NÃO ENCONTRADO OU EXPIRADO.");

      return res.status(400).json({
        error: "Desafio inválido ou expirado. Tente novamente.",
      });
    }

    console.log("✅ Challenge encontrado.");

    /*
     * Validação criptográfica da Passkey.
     */
    let verification;

    try {
      verification = await verifyRegistrationResponse({
        response: attestationResponse,
        expectedChallenge: challengeRecord.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
      });
    } catch (e) {
      console.error("========== WEBAUTHN REGISTER ERROR ==========");
      console.error(e);
      console.error("message:", e?.message);
      console.error("name:", e?.name);
      console.error("stack:", e?.stack);
      console.error("=============================================");

      return res.status(400).json({
        error: "Não foi possível validar a Passkey.",
        details: e?.message || "Erro desconhecido",
      });
    }

    console.log("Verification:", verification.verified);

    if (!verification.verified || !verification.registrationInfo) {
      console.error("❌ PASSKEY NÃO VERIFICADA.");

      return res.status(400).json({
        error: "Passkey não verificada.",
      });
    }

    /*
     * IMPORTANTE:
     *
     * Estamos usando @simplewebauthn/server 10.0.1.
     *
     * Na v10:
     *
     * registrationInfo.credentialID
     * registrationInfo.credentialPublicKey
     * registrationInfo.counter
     *
     * continuam sendo os campos corretos.
     *
     * credentialID já é Base64URL.
     */
    const {
      credentialID,
      credentialPublicKey,
      counter,
    } = verification.registrationInfo;

    console.log("========== CREDENCIAL GERADA ==========");
    console.log("credentialID:", credentialID);
    console.log(
      "credentialPublicKey existe:",
      !!credentialPublicKey
    );
    console.log("counter:", counter);
    console.log("=======================================");

    if (!credentialID) {
      return res.status(400).json({
        error: "A Passkey foi validada, mas o ID da credencial não foi retornado.",
      });
    }

    if (!credentialPublicKey) {
      return res.status(400).json({
        error: "A Passkey foi validada, mas a chave pública não foi retornada.",
      });
    }

    /*
     * Verifica se essa credencial já existe.
     */
    const existingPasskey = await prisma.passkey.findUnique({
      where: {
        credentialId: credentialID,
      },
    });

    if (existingPasskey) {
      console.log("⚠️ PASSKEY JÁ EXISTE NO BANCO.");

      return res.status(200).json({
        ok: true,
        alreadyRegistered: true,
      });
    }

    /*
     * Salva a Passkey.
     *
     * NÃO fazemos:
     *
     * Buffer.from(credentialID).toString("base64url")
     *
     * porque credentialID já está em Base64URL na v10.
     */
    const passkey = await prisma.passkey.create({
      data: {
        userId: session.userId,

        credentialId: credentialID,

        publicKey: Buffer.from(credentialPublicKey),

        counter: BigInt(counter || 0),

        transports:
          attestationResponse.response.transports || [],
      },
    });

    console.log("=======================================");
    console.log("✅ PASSKEY SALVA COM SUCESSO!");
    console.log("Banco ID:", passkey.id);
    console.log("Credential ID:", passkey.credentialId);
    console.log("User ID:", passkey.userId);
    console.log("=======================================");

    return res.status(200).json({
      ok: true,
      alreadyRegistered: false,
    });
  } catch (e) {
    console.error("========== WEBAUTHN REGISTER FATAL ERROR ==========");
    console.error(e);
    console.error("message:", e?.message);
    console.error("name:", e?.name);
    console.error("stack:", e?.stack);
    console.error("===================================================");

    return res.status(500).json({
      error: "Erro interno ao registrar a Passkey.",
      details: e?.message || "Erro desconhecido",
    });
  }
}