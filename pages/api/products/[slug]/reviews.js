const { prisma } = require("../../../../lib/prisma");

// Rota pública (não exige login) — qualquer visitante pode VER as avaliações,
// só não pode CRIAR uma (isso só acontece pelo bot, a partir de um pedido
// real e concluído — ver lib/reviews.js no bot).
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { slug } = req.query;

  const product = await prisma.product.findUnique({ where: { slug } });
  if (!product) {
    return res.status(404).json({ error: "Produto não encontrado" });
  }

  const reviews = await prisma.review.findMany({
    where: { productId: product.id },
    include: { user: { select: { username: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const count = reviews.length;
  const avgService = count ? reviews.reduce((acc, r) => acc + r.serviceStars, 0) / count : 0;
  const avgKit = count ? reviews.reduce((acc, r) => acc + r.kitStars, 0) / count : 0;
  const avgOverall = count ? (avgService + avgKit) / 2 : 0;

  return res.status(200).json({
    count,
    avgService: Number(avgService.toFixed(2)),
    avgKit: Number(avgKit.toFixed(2)),
    avgOverall: Number(avgOverall.toFixed(2)),
    reviews: reviews.map((r) => ({
      id: r.id,
      username: r.user.username,
      serviceStars: r.serviceStars,
      kitStars: r.kitStars,
      comment: r.comment,
      createdAt: r.createdAt,
    })),
  });
}