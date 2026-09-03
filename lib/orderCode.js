const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O/1/I para evitar confusão

function randomCode(length = 5) {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

async function generateUniqueOrderCode(prisma) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode(5);
    const exists = await prisma.order.findUnique({ where: { code }, select: { id: true } });
    if (!exists) return code;
  }
  throw new Error("Não foi possível gerar um código de pedido único, tente novamente.");
}

module.exports = { generateUniqueOrderCode };
