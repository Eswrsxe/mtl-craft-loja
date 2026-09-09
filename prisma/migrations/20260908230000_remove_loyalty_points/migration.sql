-- Remoção completa do sistema de pontos de fidelidade.
ALTER TABLE "User" DROP COLUMN IF EXISTS "points";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "pointsUsed";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "pointsEarned";
