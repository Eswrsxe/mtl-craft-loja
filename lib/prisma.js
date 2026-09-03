const { PrismaClient } = require("@prisma/client");

// Evita múltiplas instâncias do Prisma Client em dev (hot reload do Next.js).
const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__mtlPrisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__mtlPrisma = prisma;
}

module.exports = { prisma };
