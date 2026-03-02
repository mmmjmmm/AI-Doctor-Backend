import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking recent messages...');
  const messages = await prisma.message.findMany({
    take: 10,
    orderBy: {
      created_at: 'desc',
    },
    select: {
      message_id: true,
      role: true,
      status: true,
      content: true,
      session_id: true,
      created_at: true,
    },
  });

  console.log(JSON.stringify(messages, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
