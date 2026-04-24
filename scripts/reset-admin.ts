import "dotenv/config";
import { hashPassword } from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";

const [, , loginRaw, password] = process.argv;
const login = loginRaw?.trim().toLowerCase();

if (!login || !password) {
  console.error("Usage: npm run admin:reset -- <login> <password>");
  process.exit(1);
}

if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

async function main() {
  await prisma.user.deleteMany();
  await prisma.user.create({
    data: {
      login,
      passwordHash: await hashPassword(password),
    },
  });
  console.log(`Admin reset complete. Login: ${login}`);
}

main()
  .finally(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    process.exit(1);
  });
