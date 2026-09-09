const { prisma } = require("../../../lib/prisma");

// Rota pública. Devolve { [slug]: { avgOverall, count } } pra cada produto
// que já tem pelo menos 1 avaliação — usado pra ordenar o catálogo sem
// precisar de uma chamada por card.
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido" });

  const grouped = await prisma.review.groupBy({
    by: ["productId"],
    _avg: { serviceStars: true, kitStars: true },
    _count: { id: true },
  });

  if (grouped.length === 0) return res.status(200).json({ ratings: {} });

  const products = await prisma.product.findMany({
    where: { id: { in: grouped.map((g) => g.productId) } },
    select: { id: true, slug: true },
  });
  const slugById = Object.fromEntries(products.map((p) => [p.id, p.slug]));

  const ratings = {};
  for (const g of grouped) {
    const slug = slugById[g.productId];
    if (!slug) continue;
    const avgOverall = (Number(g._avg.serviceStars) + Number(g._avg.kitStars)) / 2;
    ratings[slug] = { avgOverall: Number(avgOverall.toFixed(2)), count: g._count.id };
  }

  return res.status(200).json({ ratings });
}
