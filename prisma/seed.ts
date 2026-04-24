import "dotenv/config";
import { hashPassword } from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("ADMIN_EMAIL and ADMIN_PASSWORD are not set, skipping seed.");
    return;
  }

  await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash: await hashPassword(password) },
    update: {},
  });
  console.log(`Admin user ready: ${email}`);
}

main()
  .finally(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
