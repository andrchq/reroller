import "dotenv/config";
import { hashPassword } from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";

async function main() {
  const login = process.env.ADMIN_LOGIN;
  const password = process.env.ADMIN_PASSWORD;
  if (!login || !password) {
    console.log("ADMIN_LOGIN and ADMIN_PASSWORD are not set, skipping seed.");
    return;
  }

  await prisma.user.upsert({
    where: { login },
    create: { login, passwordHash: await hashPassword(password) },
    update: { passwordHash: await hashPassword(password) },
  });
  console.log(`Admin user ready: ${login}`);
}

main()
  .finally(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
