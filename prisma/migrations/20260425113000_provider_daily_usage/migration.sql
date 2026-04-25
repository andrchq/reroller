CREATE TABLE "ProviderDailyUsage" (
    "id" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderDailyUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderDailyUsage_providerAccountId_provider_operation_day_key" ON "ProviderDailyUsage"("providerAccountId", "provider", "operation", "day");
CREATE INDEX "ProviderDailyUsage_provider_operation_day_idx" ON "ProviderDailyUsage"("provider", "operation", "day");

ALTER TABLE "ProviderDailyUsage" ADD CONSTRAINT "ProviderDailyUsage_providerAccountId_fkey" FOREIGN KEY ("providerAccountId") REFERENCES "ProviderAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
