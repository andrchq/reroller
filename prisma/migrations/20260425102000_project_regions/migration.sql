-- Store synchronized Selectel regions per project.
CREATE TABLE "ProjectRegion" (
    "id" TEXT NOT NULL,
    "projectBindingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectRegion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectRegion_projectBindingId_name_key" ON "ProjectRegion"("projectBindingId", "name");

ALTER TABLE "ProjectRegion"
ADD CONSTRAINT "ProjectRegion_projectBindingId_fkey"
FOREIGN KEY ("projectBindingId") REFERENCES "ProjectBinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
