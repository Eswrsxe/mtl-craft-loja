// Comunicação site -> bot. Usa um segredo compartilhado (BOT_API_SECRET) —
// nunca deixe esse endpoint público sem autenticação. O segredo só existe
// aqui (código de servidor) e nunca é enviado ao navegador do cliente.
async function notifyBotOfNewOrder(order) {
  const url = `${process.env.BOT_API_URL}/internal/orders`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": process.env.BOT_API_SECRET,
    },
    body: JSON.stringify({
      orderId: order.id,
      code: order.code,
      discordId: order.user.discordId,
      total: order.total,
      items: order.items.map((i) => ({
        name: i.nameSnapshot,
        quantity: i.quantity,
        lineTotal: i.lineTotal,
      })),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bot respondeu ${res.status}: ${text}`);
  }
  return res.json().catch(() => ({}));
}

module.exports = { notifyBotOfNewOrder };
