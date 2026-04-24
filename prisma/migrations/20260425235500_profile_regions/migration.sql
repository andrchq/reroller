CREATE TABLE "SearchProfileRegion" (
    "id" TEXT NOT NULL,
    "searchProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchProfileRegion_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SearchProfileRegion" ("id", "searchProfileId", "name")
SELECT 'c' || md5(random()::text || clock_timestamp()::text), "id", "region"
FROM "SearchProfile"
WHERE "region" IS NOT NULL AND "region" <> '';

CREATE UNIQUE INDEX "SearchProfileRegion_searchProfileId_name_key" ON "SearchProfileRegion"("searchProfileId", "name");

ALTER TABLE "SearchProfileRegion"
ADD CONSTRAINT "SearchProfileRegion_searchProfileId_fkey"
FOREIGN KEY ("searchProfileId") REFERENCES "SearchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
