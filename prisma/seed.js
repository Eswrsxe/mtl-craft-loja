// Popula o banco com o MESMO catálogo que já existe no site (mesmos ids
// usados em components/MtlCraftSite.jsx). Isso é o que permite ao backend
// validar preço/produto sem inventar outro catálogo — ver seção 9 e 11 do
// pedido original.
const { prisma } = require("../index.js");

const CATEGORIES = [
  { key: "kits", label: "Kits" },
  { key: "pvp", label: "Kit PVP" },
  { key: "vip", label: "VIP" },
  { key: "tags", label: "Tags" },
  { key: "bases", label: "Bases" },
  { key: "personalizado", label: "Personalizados" },
];

// [slug, name, price, categoryKey]
const PRODUCTS = [
  // Kits padrão
  ["kp-perolas", "KIT PÉROLAS", 1.50, "kits"],
  ["kp-forca2", "KIT FORÇA II", 1.25, "kits"],
  ["kp-speed2", "KIT SPEED II", 1.00, "kits"],
  ["kp-totem", "KIT TOTEM", 3.50, "kits"],
  ["kp-elytra", "KIT ELYTRA", 4.00, "kits"],
  ["kp-pot", "KIT POT", 4.50, "kits"],
  ["kp-clava", "KIT CLAVA", 4.50, "kits"],
  ["kp-mortal", "KIT MORTAL", 3.50, "kits"],
  ["kp-farm", "KIT FARM", 6.50, "kits"],
  // Kits PVP
  ["pv-nether", "KIT NETHER", 7.00, "pvp"],
  ["pv-netherop", "KIT NETHER OP", 10.00, "pvp"],
  ["pv-subnether", "KIT SUB NETHER", 12.00, "pvp"],
  ["pv-cristal", "KIT CRISTAL", 9.00, "pvp"],
  ["pv-pvp", "KIT PVP", 11.00, "pvp"],
  ["pv-guerreiro", "KIT GUERREIRO", 18.00, "pvp"],
  ["pv-duo", "KIT DUO", 14.00, "pvp"],
  ["pv-god", "KIT GOD", 25.00, "pvp"],
  // VIP
  ["vip-semanal", "VIP SEMANAL", 5.00, "vip"],
  ["vip-mensal", "VIP MENSAL", 15.00, "vip"],
  // Tags
  ["tag-semanal", "TAG SEMANAL", 1.00, "tags"],
  ["tag-mensal", "TAG MENSAL", 3.50, "tags"],
  // Bases
  ["base-basica", "BASE BÁSICA", 30.00, "bases"],
  ["base-op", "BASE OP", 50.00, "bases"],
  // Itens do Kit Personalizado
  ["ci-full", "Qualquer item full", 0.75, "personalizado"],
  ["ci-macadour", "Pack de Maçã Dourada", 0.50, "personalizado"],
  ["ci-moldeatual", "Molde de Atualização", 0.50, "personalizado"],
  ["ci-cristalend", "Pack de Cristal do End", 1.00, "personalizado"],
  ["ci-elytra", "Elytra", 0.50, "personalizado"],
  ["ci-elytraenc", "Elytra Encantada", 0.75, "personalizado"],
  ["ci-tnt", "Pack de TNT", 0.50, "personalizado"],
  ["ci-obsidiana", "Pack de Obsidiana", 0.75, "personalizado"],
  ["ci-teia", "Pack de Teia", 0.25, "personalizado"],
  ["ci-moldes", "Moldes Normais", 0.25, "personalizado"],
  ["ci-fungos", "10 Fungos", 0.50, "personalizado"],
  ["ci-cascos", "16 Cascos de Shulker", 0.75, "personalizado"],
  ["ci-livroenc", "Livro Encantado", 0.10, "personalizado"],
  ["ci-fogos", "Pack de Fogos", 0.10, "personalizado"],
  ["ci-spawner", "Spawner", 0.25, "personalizado"],
  ["ci-ovosnorm", "Ovos Normais", 0.25, "personalizado"],
  ["ci-ovosop", "Ovos OP", 0.35, "personalizado"],
  ["ci-frascosxp", "Pack de Frascos de XP", 0.10, "personalizado"],
  ["ci-netherite", "Barra de Netherite", 0.50, "personalizado"],
  ["ci-totem", "Totem", 0.10, "personalizado"],
  ["ci-macaenc", "Maçã Encantada (unidade)", 0.10, "personalizado"],
  ["ci-pocao", "Qualquer Poção", 0.05, "personalizado"],
  ["ci-blocos", "Pack de Blocos de Construção", 0.35, "personalizado"],
];

async function main() {
  const categoryIdByKey = {};
  for (const c of CATEGORIES) {
    const cat = await prisma.category.upsert({
      where: { key: c.key },
      update: { label: c.label },
      create: c,
    });
    categoryIdByKey[c.key] = cat.id;
  }

  for (const [slug, name, price, categoryKey] of PRODUCTS) {
    await prisma.product.upsert({
      where: { slug },
      update: { name, price, categoryId: categoryIdByKey[categoryKey], active: true },
      create: { slug, name, price, categoryId: categoryIdByKey[categoryKey] },
    });
  }

  console.log(`Seed concluído: ${PRODUCTS.length} produtos em ${CATEGORIES.length} categorias.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
