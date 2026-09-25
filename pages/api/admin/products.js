const { prisma } = require("../../../lib/prisma");
const { getSessionFromReq } = require("../../../lib/session");
const { isAdminSession } = require("../../../lib/adminAuth");

// Catálogo completo (todos os produtos ativos, inclusive Clã Oficial e itens do
// Kit Personalizado) para o painel /admin/pedido. Só para admins.
export default async function handler(req, res) {
  const session = await getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: "Faça login para continuar." });
  if (!(await isAdminSession(session))) return res.status(403).json({ error: "Acesso restrito à equipe." });

  if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido" });

  const products = await prisma.product.findMany({
    where: { active: true },
    select: {
      slug: true,
      name: true,
      price: true,
      category: { select: { key: true, label: true } },
    },
    orderBy: [{ category: { key: "asc" } }, { name: "asc" }],
  });

  return res.status(200).json({
    products: products.map((p) => ({
      slug: p.slug,
      name: p.name,
      price: Number(p.price),
      categoryKey: p.category.key,
      categoryLabel: p.category.label,
    })),
  });
}