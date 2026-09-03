const { verifyAuthenticationResponse } = require("@simplewebauthn/server");
const { prisma } = require("../../../lib/prisma");
const { setSessionCookie } = require("../../../lib/session");
const { rpConfig, consumeChallenge } = require("../../../lib/webauthn");

export default async function handler(req, res) {
  console.log("\n========== WEBAUTHN LOGIN ==========");

  try {
    if (req.method !== "POST") {
      console.log("❌ Método:", req.method);
      return res.status(405).json({
        error: "Método não permitido",
      });
    }

    const { rpID, origin } = rpConfig();

    console.log("RP ID:", rpID);
    console.log("Origin esperado:", origin);

    const assertionResponse = req.body;

    console.log("Credential ID recebido:", assertionResponse?.id);
    console.log("Credential type:", assertionResponse?.type);
    console.log(
      "Raw ID:",
      assertionResponse?.rawId
    );

    if (!assertionResponse?.id) {
      console.log("❌ Assertion não possui ID.");
      return res.status(400).json({
        error: "A Passkey não enviou um ID.",
      });
    }

    if (!assertionResponse?.response) {
      console.log("❌ Assertion não possui response.");
      return res.status(400).json({
        error: "A resposta da Passkey está incompleta.",
      });
    }

    // ------------------------------------------------------------
    // 1. LOCALIZAR PASSKEY
    // ------------------------------------------------------------

    const credentialId = assertionResponse.id;

    console.log("🔎 Procurando Passkey no banco...");

    const passkey = await prisma.passkey.findUnique({
      where: {
        credentialId,
      },
      include: {
        user: true,
      },
    });

    if (!passkey) {
      console.log("❌ PASSKEY NÃO ENCONTRADA NO BANCO.");
      console.log("ID procurado:", credentialId);

      return res.status(400).json({
        error: "Passkey não reconhecida neste site.",
        details: "O credentialId recebido pelo navegador não existe no banco.",
      });
    }

    console.log("✅ Passkey encontrada.");
    console.log("Passkey ID interno:", passkey.id);
    console.log("Usuário:", passkey.user?.id);
    console.log("Discord ID:", passkey.user?.discordId);
    console.log("Counter salvo:", String(passkey.counter));
    console.log(
      "Public key existe:",
      !!passkey.publicKey
    );
    console.log(
      "Public key tamanho:",
      passkey.publicKey?.length
    );
    console.log(
      "Transports:",
      passkey.transports
    );

    // ------------------------------------------------------------
    // 2. LER CLIENT DATA
    // ------------------------------------------------------------

    let clientDataJSON;

    try {
      clientDataJSON = JSON.parse(
        Buffer.from(
          assertionResponse.response.clientDataJSON,
          "base64url"
        ).toString("utf8")
      );
    } catch (e) {
      console.error("❌ ERRO AO LER clientDataJSON");
      console.error(e);

      return res.status(400).json({
        error: "A resposta da Passkey possui dados inválidos.",
        details: e?.message || "clientDataJSON inválido.",
      });
    }

    console.log("ClientData type:", clientDataJSON.type);
    console.log("ClientData origin:", clientDataJSON.origin);
    console.log("Challenge recebido:", clientDataJSON.challenge);

    // ------------------------------------------------------------
    // 3. CONSUMIR CHALLENGE
    // ------------------------------------------------------------

    console.log("🔎 Procurando challenge no banco...");

    const challengeRecord = await consumeChallenge(prisma, {
      challenge: clientDataJSON.challenge,
      type: "AUTHENTICATION",
    });

    if (!challengeRecord) {
      console.log("❌ CHALLENGE NÃO ENCONTRADO OU EXPIRADO.");

      return res.status(400).json({
        error: "Desafio expirado. Tente novamente.",
        details:
          "O challenge enviado pela Passkey não corresponde a um challenge válido.",
      });
    }

    console.log("✅ Challenge encontrado.");
    console.log(
      "Challenge salvo:",
      challengeRecord.challenge
    );
    console.log(
      "Challenge criado:",
      challengeRecord.createdAt
    );

    // ------------------------------------------------------------
    // 4. VERIFICAR AUTENTICAÇÃO
    // ------------------------------------------------------------

    console.log("🔐 Iniciando verifyAuthenticationResponse...");

    let verification;

    try {
      verification = await verifyAuthenticationResponse({
        response: assertionResponse,

        expectedChallenge:
          challengeRecord.challenge,

        expectedOrigin: origin,

        expectedRPID: rpID,

        authenticator: {
          credentialID: passkey.credentialId,

          credentialPublicKey: passkey.publicKey,

          counter: Number(passkey.counter),

          transports: passkey.transports,
        },
      });
    } catch (e) {
      console.error(
        "========== WEBAUTHN LOGIN ERROR =========="
      );

      console.error(e);

      console.error(
        "message:",
        e?.message
      );

      console.error(
        "name:",
        e?.name
      );

      console.error(
        "stack:",
        e?.stack
      );

      console.error(
        "=========================================="
      );

      return res.status(400).json({
        error: "Login recusado.",
        details:
          e?.message ||
          "Erro desconhecido durante a verificação.",
      });
    }

    console.log(
      "Resultado da verificação:",
      verification
    );

    // ------------------------------------------------------------
    // 5. RESULTADO
    // ------------------------------------------------------------

    if (!verification.verified) {
      console.log("❌ verification.verified = false");

      return res.status(400).json({
        error: "Login recusado.",
        details:
          "A assinatura da Passkey não pôde ser validada.",
      });
    }

    console.log("✅ PASSKEY VERIFICADA!");

    // ------------------------------------------------------------
    // 6. ATUALIZAR COUNTER
    // ------------------------------------------------------------

    const newCounter =
      verification.authenticationInfo.newCounter;

    console.log(
      "Counter antigo:",
      String(passkey.counter)
    );

    console.log(
      "Counter novo:",
      String(newCounter)
    );

    await prisma.passkey.update({
      where: {
        id: passkey.id,
      },
      data: {
        counter: BigInt(newCounter),
        lastUsedAt: new Date(),
      },
    });

    console.log("✅ Counter atualizado.");

    // ------------------------------------------------------------
    // 7. CRIAR SESSÃO
    // ------------------------------------------------------------

    await setSessionCookie(res, {
      userId: passkey.user.id,
      discordId: passkey.user.discordId,
    });

    console.log("✅ Sessão criada.");
    console.log("========== WEBAUTHN LOGIN OK ==========\n");

    return res.status(200).json({
      ok: true,
    });

  } catch (e) {
    console.error(
      "\n========== ERRO GERAL WEBAUTHN =========="
    );

    console.error(e);

    console.error(
      "message:",
      e?.message
    );

    console.error(
      "name:",
      e?.name
    );

    console.error(
      "stack:",
      e?.stack
    );

    console.error(
      "=========================================\n"
    );

    return res.status(500).json({
      error: "Erro interno ao processar a Passkey.",
      details:
        e?.message ||
        "Erro desconhecido.",
    });
  }
}