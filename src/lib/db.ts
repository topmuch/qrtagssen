import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const createPrismaClient = () => {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' 
      ? ['query', 'info', 'warn', 'error'] 
      : ['warn', 'error'],
  })
}

const rawPrisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = rawPrisma
}

// Graceful shutdown - close Prisma connection on process exit
process.on('beforeExit', async () => {
  await rawPrisma.$disconnect()
})

/**
 * Database client with backward compatibility alias.
 * 
 * The Baggage model was renamed to Tag in the Prisma schema,
 * but many legacy API routes still reference `db.baggage`.
 * This proxy automatically redirects `db.baggage.*` calls to `db.tag.*`.
 */
export const db = new Proxy(rawPrisma, {
  get(target, prop: string) {
    // Redirect db.baggage → db.tag for backward compatibility
    if (prop === 'baggage') {
      return target.tag;
    }
    const value = (target as Record<string, unknown>)[prop];
    return value;
  },
});

export type { PrismaClient }
