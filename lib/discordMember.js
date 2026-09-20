// Consulta uma pessoa no servidor do Discord (usada pelo painel /admin/pedido).
//
// Precisa de 2 variáveis de ambiente no site (as mesmas do bot):
//   DISCORD_BOT_TOKEN  — token do bot (só é usado para LER o membro no servidor)
//   DISCORD_GUILD_ID   — ID do servidor
//
// Se elas NÃO estiverem configuradas, o painel continua funcionando só para
// quem já entrou alguma vez no site (existe na tabela User) — nesse caso não
// dá para garantir que a pessoa ainda está no servidor, e a resposta avisa isso
// (`verified: false`).

const DISCORD_API = "https://discord.com/api/v10";

function clean(value) {
  if (typeof value !== "string") return "";
  let v = value.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function getBotConfig() {
  return { token: clean(process.env.DISCORD_BOT_TOKEN), guildId: clean(process.env.DISCORD_GUILD_ID) };
}

function isValidDiscordId(value) {
  return /^\d{17,20}$/.test(String(value || ""));
}

function avatarUrl(discordId, avatarHash) {
  if (avatarHash) {
    const ext = String(avatarHash).startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${ext}?size=64`;
  }
  const index = Number((BigInt(discordId) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

// Devolve { ok: true, verified, fromDiscord, profile } ou { ok: false, status, error }.
async function resolveTargetMember(prisma, discordId) {
  const { token, guildId } = getBotConfig();

  if (token && guildId) {
    let res;
    try {
      res = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${discordId}`, {
        headers: { Authorization: `Bot ${token}` },
      });
    } catch (_) {
      return { ok: false, status: 502, error: "Não consegui falar com o Discord agora. Tente de novo." };
    }
    if (res.status === 404) return { ok: false, status: 404, error: "Essa pessoa não está no servidor." };
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        status: 500,
        error: "O bot não tem acesso ao servidor a partir do site. Confira DISCORD_BOT_TOKEN e DISCORD_GUILD_ID.",
      };
    }
    if (!res.ok) return { ok: false, status: 502, error: `O Discord respondeu com erro (${res.status}). Tente de novo.` };

    const member = await res.json();
    const user = member.user || {};
    if (user.bot) return { ok: false, status: 400, error: "Esse ID é de um bot, não de uma pessoa." };

    return {
      ok: true,
      verified: true,
      fromDiscord: true,
      profile: {
        discordId: user.id,
        username: user.username,
        discriminator: user.discriminator || null,
        avatar: user.avatar || null,
        displayName: member.nick || user.global_name || user.username,
        avatarUrl: avatarUrl(user.id, user.avatar),
      },
    };
  }

  const dbUser = await prisma.user.findUnique({ where: { discordId } });
  if (!dbUser) {
    return {
      ok: false,
      status: 404,
      error:
        "Não encontrei essa pessoa: ela nunca entrou no site e o site ainda não consulta o servidor do Discord (configure DISCORD_BOT_TOKEN e DISCORD_GUILD_ID).",
    };
  }
  return {
    ok: true,
    verified: false,
    fromDiscord: false,
    profile: {
      discordId: dbUser.discordId,
      username: dbUser.username,
      discriminator: dbUser.discriminator || null,
      avatar: dbUser.avatar || null,
      displayName: dbUser.username,
      avatarUrl: avatarUrl(dbUser.discordId, dbUser.avatar),
    },
  };
}

module.exports = { getBotConfig, isValidDiscordId, resolveTargetMember };