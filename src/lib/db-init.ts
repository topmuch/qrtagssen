/**
 * Shared database initialization utilities.
 * Used by /api/auth/init and /api/auth/login to ensure
 * the database is ready without self-fetching.
 */

import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

// ═══════════════════════════════════════════════════
// FULL TABLE CREATION SQL (SQLite)
// ═══════════════════════════════════════════════════

const CREATE_TABLES_SQL = [
  // Independent tables first (no foreign keys)
  `CREATE TABLE IF NOT EXISTS "AgencyType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL UNIQUE,
    "label" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "description" TEXT,
    "customFields" TEXT NOT NULL DEFAULT '[]',
    "color" TEXT NOT NULL DEFAULT '#2563EB',
    "isActive" BOOLEAN NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "Agency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL UNIQUE,
    "agencyTypeId" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#2563EB',
    "secondaryColor" TEXT NOT NULL DEFAULT '#F59E0B',
    "customMessage" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT 1,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT 0,
    "onboardingStep" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("agencyTypeId") REFERENCES "AgencyType"("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "name" TEXT,
    "password" TEXT,
    "role" TEXT NOT NULL DEFAULT 'agency',
    "agencyId" TEXT,
    "staffRole" TEXT,
    "permissions" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "lastActivity" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "LoginLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "country" TEXT,
    "city" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serialNumber" TEXT NOT NULL UNIQUE,
    "qrCodeUrl" TEXT,
    "tagType" TEXT NOT NULL DEFAULT 'standard',
    "agencyId" TEXT,
    "endUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'created',
    "customData" TEXT NOT NULL DEFAULT '{}',
    "ownerName" TEXT,
    "ownerPhone" TEXT,
    "ownerEmail" TEXT,
    "itemName" TEXT,
    "itemDescription" TEXT,
    "itemCategory" TEXT,
    "locationBuilding" TEXT,
    "locationRoom" TEXT,
    "locationNote" TEXT,
    "activatedAt" DATETIME,
    "expiresAt" DATETIME,
    "lastScanDate" DATETIME,
    "lastLocation" TEXT,
    "declaredLostAt" DATETIME,
    "foundAt" DATETIME,
    "founderName" TEXT,
    "founderPhone" TEXT,
    "founderEmail" TEXT,
    "founderMessage" TEXT,
    "founderAt" DATETIME,
    "setId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "ScanLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tagId" TEXT NOT NULL,
    "scannedBy" TEXT,
    "scannerId" TEXT,
    "scanType" TEXT NOT NULL DEFAULT 'finder',
    "ipAddress" TEXT,
    "country" TEXT,
    "city" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "location" TEXT,
    "notes" TEXT,
    "whatsappStatus" TEXT,
    "aiAnalysis" TEXT,
    "groqUsed" BOOLEAN NOT NULL DEFAULT 0,
    "groqLatencyMs" INTEGER,
    "groqModelUsed" TEXT,
    "wakitMessageId" TEXT,
    "context" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Setting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL UNIQUE,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "FeatureFlag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL UNIQUE,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "enabled" BOOLEAN NOT NULL DEFAULT 0,
    "icon" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL UNIQUE,
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "status" TEXT NOT NULL DEFAULT 'trial',
    "startDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" DATETIME,
    "trialEndsAt" DATETIME,
    "maxTags" INTEGER NOT NULL DEFAULT 50,
    "maxUsers" INTEGER NOT NULL DEFAULT 5,
    "maxScans" INTEGER NOT NULL DEFAULT 1000,
    "amount" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "transactionId" TEXT,
    "phoneNumber" TEXT,
    "description" TEXT,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "Wallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL UNIQUE,
    "balance" REAL NOT NULL DEFAULT 0,
    "totalEarned" REAL NOT NULL DEFAULT 0,
    "totalWithdrawn" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'non_lu',
    "senderName" TEXT,
    "senderEmail" TEXT,
    "senderPhone" TEXT,
    "agencyId" TEXT,
    "recipientAgencyId" TEXT,
    "subject" TEXT,
    "content" TEXT NOT NULL,
    "tagId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("agencyId") REFERENCES "Agency"("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "userId" TEXT,
    "agencyId" TEXT,
    "tagId" TEXT,
    "message" TEXT NOT NULL,
    "data" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("agencyId") REFERENCES "Agency"("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tagId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "customData" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "activatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE,
    FOREIGN KEY ("agencyId") REFERENCES "Agency"("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "SystemLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
];

// Track if init has been run this process (avoid re-running on every request)
let _initDone = false;
let _initPromise: Promise<void> | null = null;

/**
 * Ensure all required database tables exist.
 * Creates tables using raw SQL if they don't exist.
 */
export async function ensureTablesExist(): Promise<{ created: string[]; errors: string[] }> {
  const created: string[] = [];
  const errors: string[] = [];

  for (const sql of CREATE_TABLES_SQL) {
    const tableNameMatch = sql.match(/CREATE TABLE IF NOT EXISTS "(\w+)"/);
    const tableName = tableNameMatch ? tableNameMatch[1] : 'unknown';

    try {
      await db.$executeRawUnsafe(sql);
      created.push(tableName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${tableName}: ${msg}`);
      console.error(`[db-init] ✗ Failed to create table ${tableName}:`, msg);
    }
  }

  return { created, errors };
}

const ADMIN_PERMISSIONS = [
  'VIEW_DASHBOARD', 'MANAGE_TAGS', 'MANAGE_AGENCIES', 'MANAGE_USERS',
  'MANAGE_AGENCY_TYPES', 'MANAGE_SUBSCRIPTIONS', 'MANAGE_PAYMENTS',
  'MANAGE_SETTINGS', 'MANAGE_FEATURES', 'VIEW_WALLET', 'MANAGE_STAFF',
  'MANAGE_WHITE_LABEL', 'MANAGE_MESSAGES', 'MANAGE_BLOG',
  'MANAGE_ADVERTISEMENTS', 'MANAGE_CRM', 'VIEW_REPORTS',
  'MANAGE_BACKUP', 'MANAGE_SECURITY',
];

/**
 * Ensure the superadmin user exists and has the correct password.
 * This function ALSO resets the password if it doesn't match the expected default.
 * This is critical because in Docker, previous failed creates may have left
 * a user with a wrong or null password.
 */
export async function ensureAdminUser(): Promise<{ created: boolean; reset: boolean; email: string; error?: string }> {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@qrtags.com').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const adminName = process.env.ADMIN_NAME || 'Super Admin QRTags';

  // Check if admin exists and verify password
  try {
    const existing = await db.user.findUnique({
      where: { email: adminEmail },
      select: { id: true, password: true, role: true },
    });

    if (existing) {
      // Admin exists - verify password matches
      if (existing.password) {
        const passwordMatches = await bcrypt.compare(adminPassword, existing.password);
        if (passwordMatches) {
          return { created: false, reset: false, email: adminEmail };
        }
        // Password doesn't match - reset it!
        console.log(`[db-init] Admin password mismatch, resetting...`);
        const newHash = await bcrypt.hash(adminPassword, 12);
        try {
          await db.user.update({
            where: { id: existing.id },
            data: { password: newHash, role: 'superadmin', isActive: true },
          });
          console.log(`[db-init] ✓ Admin password reset: ${adminEmail}`);
          return { created: false, reset: true, email: adminEmail };
        } catch {
          // Try raw SQL update
          try {
            await db.$executeRawUnsafe(
              `UPDATE User SET password = ?, role = 'superadmin', isActive = 1 WHERE id = ?`,
              newHash, existing.id
            );
            console.log(`[db-init] ✓ Admin password reset (raw SQL): ${adminEmail}`);
            return { created: false, reset: true, email: adminEmail };
          } catch (rawErr) {
            console.error(`[db-init] ✗ Password reset failed:`, rawErr);
          }
        }
      } else {
        // Password is null - set it
        const newHash = await bcrypt.hash(adminPassword, 12);
        try {
          await db.user.update({
            where: { id: existing.id },
            data: { password: newHash, role: 'superadmin', isActive: true },
          });
          console.log(`[db-init] ✓ Admin password set (was null): ${adminEmail}`);
          return { created: false, reset: true, email: adminEmail };
        } catch {
          try {
            await db.$executeRawUnsafe(
              `UPDATE User SET password = ?, role = 'superadmin', isActive = 1 WHERE id = ?`,
              newHash, existing.id
            );
            return { created: false, reset: true, email: adminEmail };
          } catch { /* ignore */ }
        }
      }
      return { created: false, reset: false, email: adminEmail };
    }
  } catch {
    console.log('[db-init] Prisma check failed, trying raw SQL...');
  }

  // Check via raw SQL
  try {
    const rawResult = await db.$queryRawUnsafe(
      `SELECT id, password FROM User WHERE email = ? LIMIT 1`,
      adminEmail
    ) as Array<{ id: string; password: string | null }>;

    if (rawResult.length > 0) {
      const existingUser = rawResult[0];
      // Verify/set password
      if (existingUser.password) {
        const passwordMatches = await bcrypt.compare(adminPassword, existingUser.password);
        if (passwordMatches) {
          return { created: false, reset: false, email: adminEmail };
        }
      }
      // Reset password
      const newHash = await bcrypt.hash(adminPassword, 12);
      try {
        await db.$executeRawUnsafe(
          `UPDATE User SET password = ?, role = 'superadmin', isActive = 1 WHERE id = ?`,
          newHash, existingUser.id
        );
        console.log(`[db-init] ✓ Admin password reset (raw): ${adminEmail}`);
        return { created: false, reset: true, email: adminEmail };
      } catch { /* ignore */ }
      return { created: false, reset: false, email: adminEmail };
    }
  } catch {
    console.log('[db-init] Raw SQL check failed, creating admin...');
  }

  // Create admin user
  const hashedPassword = await bcrypt.hash(adminPassword, 12);

  // Try Prisma ORM create
  try {
    await db.user.create({
      data: {
        email: adminEmail,
        name: adminName,
        password: hashedPassword,
        role: 'superadmin',
        permissions: JSON.stringify(ADMIN_PERMISSIONS),
        isActive: true,
      },
    });
    console.log(`[db-init] ✓ SuperAdmin created via Prisma: ${adminEmail}`);
    return { created: true, reset: false, email: adminEmail };
  } catch (prismaErr) {
    console.error('[db-init] Prisma create failed:', prismaErr instanceof Error ? prismaErr.message : String(prismaErr));
  }

  // Fallback: raw SQL create
  const id = `cm_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const now = new Date().toISOString();
  try {
    await db.$executeRawUnsafe(
      `INSERT INTO User (id, email, name, password, role, permissions, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      id, adminEmail, adminName, hashedPassword, 'superadmin',
      JSON.stringify(ADMIN_PERMISSIONS),
      now, now
    );
    console.log(`[db-init] ✓ SuperAdmin created via raw SQL: ${adminEmail}`);
    return { created: true, reset: false, email: adminEmail };
  } catch (rawErr) {
    const errMsg = rawErr instanceof Error ? rawErr.message : String(rawErr);
    console.error('[db-init] ✗ Raw SQL create also failed:', errMsg);
    return { created: false, reset: false, email: adminEmail, error: errMsg };
  }
}

/**
 * Full database initialization: ensure tables → ensure admin user.
 * This is the main function to call from any API route.
 * Runs only once per process (subsequent calls are no-ops).
 */
export async function initializeDatabase(): Promise<{
  tables: { created: string[]; errors: string[] };
  admin: { created: boolean; reset: boolean; email: string; error?: string };
}> {
  // If already initialized this process, skip
  if (_initDone) {
    return {
      tables: { created: [], errors: [] },
      admin: { created: false, reset: false, email: '' },
    };
  }

  // If init is currently running, wait for it
  if (_initPromise) {
    await _initPromise;
    return {
      tables: { created: [], errors: [] },
      admin: { created: false, reset: false, email: '' },
    };
  }

  // Run initialization
  _initPromise = (async () => {
    console.log('[db-init] ═══ Starting database initialization ═══');

    // Step 1: Ensure tables exist
    const tablesResult = await ensureTablesExist();
    console.log(`[db-init] Tables: ${tablesResult.created.length} OK, ${tablesResult.errors.length} errors`);

    // Step 2: Ensure admin user exists with correct password
    const adminResult = await ensureAdminUser();

    console.log('[db-init] ═══ Initialization complete ═══');
    _initDone = true;

    return { tables: tablesResult, admin: adminResult };
  })();

  return _initPromise;
}

/**
 * Force re-initialization (used by /api/auth/init endpoint).
 */
export function resetInitFlag() {
  _initDone = false;
  _initPromise = null;
}
