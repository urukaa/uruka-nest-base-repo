import './setup-env';

/**
 * Probes the database once, before any suite runs, and records the result for
 * `describeWithDb`.
 *
 * The suite has to hold two properties at the same time: it must run on a fresh
 * clone with no database (so cloning the base repo is verifiable), and it must
 * really exercise SQL constraints where that is the whole point — unique
 * usernames, upserts, cascades. Skipping is what lets both be true.
 */
export default async function globalSetup(): Promise<void> {
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    await prisma.$queryRaw`SELECT 1`;
    process.env.DB_AVAILABLE = 'true';
  } catch {
    process.env.DB_AVAILABLE = 'false';
    console.warn(
      '\n  No database reachable — database-backed specs will be skipped.' +
        '\n  Set DATABASE_URL in .env and run migrations to include them.\n',
    );
  } finally {
    await prisma.$disconnect();
  }
}
