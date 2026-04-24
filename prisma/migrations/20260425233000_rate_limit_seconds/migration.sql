ALTER TABLE "RateLimitPolicy" RENAME COLUMN "minDelayMs" TO "minDelaySeconds";
ALTER TABLE "RateLimitPolicy" RENAME COLUMN "cooldownAfterError" TO "errorDelaySeconds";
ALTER TABLE "RateLimitPolicy" RENAME COLUMN "maxAttempts" TO "maxRuntimeSeconds";

ALTER TABLE "RateLimitPolicy" ADD COLUMN "maxDelaySeconds" INTEGER NOT NULL DEFAULT 30;

UPDATE "RateLimitPolicy"
SET
  "minDelaySeconds" = GREATEST(1, CEIL("minDelaySeconds" / 1000.0)::INTEGER),
  "errorDelaySeconds" = GREATEST(1, CEIL("errorDelaySeconds" / 1000.0)::INTEGER);

UPDATE "RateLimitPolicy"
SET
  "maxDelaySeconds" = GREATEST("minDelaySeconds", "minDelaySeconds" * 3),
  "maxRuntimeSeconds" = GREATEST(60, "maxRuntimeSeconds" * "minDelaySeconds");

ALTER TABLE "RateLimitPolicy" DROP COLUMN "burst";
