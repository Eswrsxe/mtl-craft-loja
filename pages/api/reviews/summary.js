const { prisma } = require("../../../lib/prisma");

// Rota pública — é só um resumo agregado, sem dado sensível nenhum.
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido" });

  const agg = await prisma.review.aggregate({
    _avg: { serviceStars: true, kitStars: true },
    _count: { id: true },
  });

  const count = agg._count.id;
  const avgOverall = count > 0 ? (Number(agg._avg.serviceStars) + Number(agg._avg.kitStars)) / 2 : 0;

  return res.status(200).json({ count, avgOverall: Number(avgOverall.toFixed(2)) });
}
