// Lê e sanitiza as variáveis de ambiente do Discord OAuth2.
//
// Motivo: ao colar valores no painel da Vercel é muito comum vir junto um
// espaço, uma quebra de linha ou aspas ("abc"), o que faz o Discord responder
// {"error":"invalid_client"} na troca do code por token.

function clean(value) {
  if (typeof value !== "string") return "";
  let v = value.trim();
  // remove aspas simples/duplas que envolvem o valor inteiro
  if (
    v.length >= 2 &&
    ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function getDiscordConfig() {
  const clientId = clean(process.env.DISCORD_CLIENT_ID);
  const clientSecret = clean(process.env.DISCORD_CLIENT_SECRET);
  const redirectUri = clean(process.env.DISCORD_REDIRECT_URI);

  const problems = [];
  if (!clientId) problems.push("DISCORD_CLIENT_ID ausente");
  else if (!/^\d{17,20}$/.test(clientId))
    problems.push("DISCORD_CLIENT_ID inválido (deve ser só números, 17-20 dígitos — é o 'Application ID')");

  if (!clientSecret) problems.push("DISCORD_CLIENT_SECRET ausente");
  else if (clientSecret.length < 20)
    problems.push(
      `DISCORD_CLIENT_SECRET muito curto (${clientSecret.length} caracteres) — use o 'Client Secret' da aba OAuth2, não o Public Key nem o Token do bot`
    );

  if (!redirectUri) problems.push("DISCORD_REDIRECT_URI ausente");
  else if (!/^https?:\/\//.test(redirectUri))
    problems.push("DISCORD_REDIRECT_URI deve começar com http:// ou https://");

  return { clientId, clientSecret, redirectUri, problems };
}

module.exports = { getDiscordConfig };