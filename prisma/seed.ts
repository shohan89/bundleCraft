import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { seedTemplates } from "../services/templates/seed";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// The template catalog itself lives in lib/templates/catalog.ts (one place, also used by tests).
seedTemplates(prisma)
  .then(async ({ upserted }) => {
    console.log(`Seeded ${upserted} templates.`);
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
