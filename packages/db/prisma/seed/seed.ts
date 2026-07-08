import { prisma } from '../../src/client';
import { plants } from './plants';

async function main() {
  for (const plant of plants) {
    await prisma.product.upsert({
      where: { latin_name: plant.latin_name },
      update: plant,
      create: plant,
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
