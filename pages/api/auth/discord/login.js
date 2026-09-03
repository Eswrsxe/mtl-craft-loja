const crypto = require("crypto");

export default function handler(req, res) {
  const state = crypto.randomBytes(16).toString("hex");

  const isProd = process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    `mtl_oauth_state=${state}; Path=/; HttpOnly; Max-Age=600; SameSite=Lax${isProd ? "; Secure" : ""}`
  );

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify",
    state,
    prompt: "consent",
  });

  res.writeHead(302, { Location: `https://discord.com/api/oauth2/authorize?${params.toString()}` });
  res.end();
}
