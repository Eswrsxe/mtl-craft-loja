const { prisma } = require("../../../../lib/prisma");
const { setSessionCookie, parseCookies } = require("../../../../lib/session");
const { getDiscordConfig } = require("../../../../lib/discordEnv");

export default async function handler(req, res) {
  const { code, state, error } = req.query;

  if (error) {
    res.redirect(302, "/?authError=1");
    return;
  }

  const cookies = parseCookies(req.headers.cookie || "");
  if (!state || !cookies.mtl_oauth_state || state !== cookies.mtl_oauth_state) {
    return res.status(400).send("Estado OAuth2 inválido (possível CSRF). Tente entrar novamente.");
  }
  if (!code) {
    return res.status(400).send("Código de autorização ausente.");
  }

  const { clientId, clientSecret, redirectUri, problems } = getDiscordConfig();
  if (problems.length) {
    console.error("Configuração do Discord OAuth2 inválida:", problems.join(" | "));
    res.redirect(302, "/?authError=1");
    return;
  }

  try {
    // 1) Troca o code pelo access_token
    // Credenciais enviadas via HTTP Basic (formato recomendado pela doc do Discord).
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenRes.ok) {
      const txt = await tokenRes.text();
      console.error("Falha ao trocar code por token:", txt);
      // Diagnóstico seguro (não expõe o secret):
      console.error("Diagnóstico Discord OAuth2:", {
        status: tokenRes.status,
        clientId,
        clientSecretLength: clientSecret.length,
        redirectUri,
        dica: txt.includes("invalid_client")
          ? "client_id/client_secret não conferem. Gere um novo Client Secret no Developer Portal (OAuth2), atualize DISCORD_CLIENT_SECRET na Vercel e faça Redeploy."
          : txt.includes("invalid_grant")
          ? "redirect_uri diferente do cadastrado no Discord, ou o code já foi usado/expirou."
          : undefined,
      });
      res.redirect(302, "/?authError=1");
      return;
    }
    const tokenData = await tokenRes.json();

    // 2) Busca o perfil do usuário logado no Discord
    const profileRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `${tokenData.token_type} ${tokenData.access_token}` },
    });
    if (!profileRes.ok) {
      res.redirect(302, "/?authError=1");
      return;
    }
    const profile = await profileRes.json();
    // profile: { id, username, discriminator, avatar, ... } — usamos `id` (discordId) como chave primária.

    const existing = await prisma.user.findUnique({ where: { discordId: profile.id } });
    const user = await prisma.user.upsert({
      where: { discordId: profile.id },
      update: {
        username: profile.username,
        discriminator: profile.discriminator || null,
        avatar: profile.avatar || null,
      },
      create: {
        discordId: profile.id,
        username: profile.username,
        discriminator: profile.discriminator || null,
        avatar: profile.avatar || null,
      },
    });

    await setSessionCookie(res, { userId: user.id, discordId: user.discordId });

    const isFirstLogin = !existing;
    const oauthStateClear = `mtl_oauth_state=; Path=/; Max-Age=0`;
    res.setHeader("Set-Cookie", [res.getHeader("Set-Cookie"), oauthStateClear].flat());

    res.redirect(302, `/?authed=1&first=${isFirstLogin ? "1" : "0"}`);
    return;
  } catch (e) {
    console.error("Erro no callback do Discord OAuth2:", e);
    res.redirect(302, "/?authError=1");
    return;
  }
}