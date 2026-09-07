// Admin do site = uma lista fixa de Discord IDs na variável de ambiente
// ADMIN_DISCORD_IDS (separados por vírgula). Não depende de cargo do
// Discord (o site não tem acesso à API do Discord) — é só uma lista curta
// de quem pode mexer em cupons.
function getAdminIds() {
  return (process.env.ADMIN_DISCORD_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAdminSession(session) {
  if (!session?.discordId) return false;
  return getAdminIds().includes(session.discordId);
}

module.exports = { isAdminSession };
