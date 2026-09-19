-- Nome do Clã informado na compra do produto "Clã Oficial" (nulo nas demais compras).
-- Idempotente: o bot aplica uma migration equivalente no startup dele, então
-- quem rodar primeiro cria a coluna e o outro simplesmente ignora.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "clanName" TEXT;