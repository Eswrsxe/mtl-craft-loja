// Regras do produto "Clã Oficial" (Reivindicar Clã).
//
// O Clã Oficial é um produto independente das Tags e dos Kits: é o ÚNICO que
// exige o "Nome do Clã" na hora de continuar a compra. Esse nome é gravado no
// pedido (Order.clanName) e o bot o mostra no ticket do Discord.
//
// IMPORTANTE: o slug abaixo precisa ser o mesmo de prisma/seed.js e de
// CLAN_PRODUCT_ID em components/MtlCraftSite.jsx.

const CLAN_PRODUCT_SLUG = "cla-oficial";
const CLAN_NAME_MIN = 2;
const CLAN_NAME_MAX = 32;

// Tira espaços das pontas e junta espaços/quebras repetidos em um só.
function normalizeClanName(raw) {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim();
}

// Retorna { ok: true, value } ou { ok: false, error }.
function validateClanName(raw) {
  const value = normalizeClanName(raw);
  if (!value) return { ok: false, error: "Informe o Nome do Clã para continuar." };

  const length = Array.from(value).length; // conta emoji como 1 caractere
  if (length < CLAN_NAME_MIN) {
    return { ok: false, error: `O Nome do Clã precisa ter pelo menos ${CLAN_NAME_MIN} caracteres.` };
  }
  if (length > CLAN_NAME_MAX) {
    return { ok: false, error: `O Nome do Clã pode ter no máximo ${CLAN_NAME_MAX} caracteres.` };
  }
  // Crase quebraria a formatação no Discord; caracteres de controle/invisíveis
  // (inclusive os que invertem o sentido do texto) não fazem sentido em um nome.
  if (/[`\p{C}]/u.test(value)) {
    return { ok: false, error: "O Nome do Clã contém caracteres não permitidos." };
  }
  return { ok: true, value };
}

module.exports = {
  CLAN_PRODUCT_SLUG,
  CLAN_NAME_MIN,
  CLAN_NAME_MAX,
  normalizeClanName,
  validateClanName,
};