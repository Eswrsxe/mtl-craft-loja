-- CreateTable
CREATE TABLE "AdminGrant" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "invitedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "AdminGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminGrant_discordId_key" ON "AdminGrant"("discordId");

-- CreateIndex
CREATE INDEX "AdminGrant_status_idx" ON "AdminGrant"("status");
