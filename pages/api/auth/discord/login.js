const crypto = require("crypto");
const { getDiscordConfig } = require("../../../../lib/discordEnv");

export default function handler(req, res) {
  const { clientId, redirectUri, problems } = getDiscordConfig();

  // No login só precisamos de client_id e redirect_uri; o secret é usado no callback.
  const loginProblems = problems.filter((p) => !p.startsWith("DISCORD_CLIENT_SECRET"));
  if (loginProblems.length) {
    console.error("Configuração do Discord OAuth2 inválida:", loginProblems.join(" | "));
    res.redirect(302, "/?authError=1");
    return;
  }

  const state = crypto.randomBytes(16).toString("hex");

  const isProd = process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    `mtl_oauth_state=${state}; Path=/; HttpOnly; Max-Age=600; SameSite=Lax${isProd ? "; Secure" : ""}`
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify",
    state,
    prompt: "consent",
  });

  res.writeHead(302, { Location: `https://discord.com/api/oauth2/authorize?${params.toString()}` });
  res.end();
}