// Admin do site = a lista fixa ADMIN_DISCORD_IDS (variável de ambiente) OU
// alguém que foi CONVIDADO por um admin e ACEITOU o convite (tabela
// AdminGrant, ver /admin/convite). O convite só dá acesso ao painel do
// site — nunca mexe em cargo/permissão dentro do servidor do Discord.
const { prisma } = require("./prisma");

function getAdminIds() {
  return (process.env.ADMIN_DISCORD_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function isAdminSession(session) {
  if (!session?.discordId) return false;
  if (getAdminIds().includes(session.discordId)) return true;

  try {
    const grant = await prisma.adminGrant.findUnique({ where: { discordId: session.discordId } });
    return grant?.status === "ACCEPTED";
  } catch (e) {
    console.error("Erro ao consultar AdminGrant em isAdminSession:", e);
    return false;
  }
}

module.exports = { isAdminSession, getAdminIds };