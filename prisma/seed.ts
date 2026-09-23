import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, TemplateCategory } from "../lib/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const templates: {
  name: string;
  category: TemplateCategory;
  configurationJson: object;
}[] = [
  {
    name: "Complete Look",
    category: TemplateCategory.fashion,
    configurationJson: { sections: ["top", "bottom", "accessory"] },
  },
  {
    name: "Weekend Outfit",
    category: TemplateCategory.fashion,
    configurationJson: { sections: ["top", "bottom", "shoes"] },
  },
  {
    name: "Seasonal Collection",
    category: TemplateCategory.fashion,
    configurationJson: { sections: ["top", "bottom", "outerwear", "accessory"] },
  },
  {
    name: "Skincare Routine",
    category: TemplateCategory.beauty,
    configurationJson: { sections: ["cleanser", "serum", "moisturizer"] },
  },
  {
    name: "Hair Care Kit",
    category: TemplateCategory.beauty,
    configurationJson: { sections: ["shampoo", "conditioner", "treatment"] },
  },
];

async function main() {
  for (const template of templates) {
    await prisma.template.upsert({
      where: { name_category: { name: template.name, category: template.category } },
      update: { configurationJson: template.configurationJson },
      create: template,
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
