import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

// ═══════════════════════════════════════════════════
// FULL TABLE CREATION SQL (SQLite)
// These CREATE TABLE IF NOT EXISTS statements ensure
// the database has all required tables even when
// prisma db push fails in Docker.
// ═══════════════════════════════════════════════════

const CREATE_TABLES_SQL = [
  // User table
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

  // Session table
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

  // LoginLog table
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

  // AgencyType table
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

  // Agency table
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

  // Tag table
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

  // ScanLog table
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

  // Setting table
  `CREATE TABLE IF NOT EXISTS "Setting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL UNIQUE,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  // FeatureFlag table
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

  // Subscription table
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

  // Payment table
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

  // Wallet table
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

  // Message table
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

  // Notification table
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

  // Booking table
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

  // SystemLog table
  `CREATE TABLE IF NOT EXISTS "SystemLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
];

// Indexes for performance
const CREATE_INDEXES_SQL = [
  `CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId")`,
  `CREATE INDEX IF NOT EXISTS "LoginLog_userId_idx" ON "LoginLog"("userId")`,
  `CREATE INDEX IF NOT EXISTS "User_agencyId_idx" ON "User"("agencyId")`,
  `CREATE INDEX IF NOT EXISTS "Tag_agencyId_idx" ON "Tag"("agencyId")`,
  `CREATE INDEX IF NOT EXISTS "ScanLog_tagId_idx" ON "ScanLog"("tagId")`,
  `CREATE INDEX IF NOT EXISTS "Message_agencyId_idx" ON "Message"("agencyId")`,
  `CREATE INDEX IF NOT EXISTS "Notification_agencyId_idx" ON "Notification"("agencyId")`,
  `CREATE INDEX IF NOT EXISTS "SystemLog_level_idx" ON "SystemLog"("level")`,
  `CREATE INDEX IF NOT EXISTS "SystemLog_source_idx" ON "SystemLog"("source")`,
  `CREATE INDEX IF NOT EXISTS "SystemLog_createdAt_idx" ON "SystemLog"("createdAt")`,
];

/**
 * Ensure all required database tables exist.
 * Creates tables using raw SQL if they don't exist.
 * This is the failsafe when prisma db push fails in Docker.
 */
async function ensureTablesExist(): Promise<{ created: string[]; errors: string[] }> {
  const created: string[] = [];
  const errors: string[] = [];

  // Create tables
  for (const sql of CREATE_TABLES_SQL) {
    const tableNameMatch = sql.match(/CREATE TABLE IF NOT EXISTS "(\w+)"/);
    const tableName = tableNameMatch ? tableNameMatch[1] : 'unknown';

    try {
      await db.$executeRawUnsafe(sql);
      created.push(tableName);
      console.log(`[auth/init] ✓ Table ensured: ${tableName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${tableName}: ${msg}`);
      console.error(`[auth/init] ✗ Failed to create table ${tableName}:`, msg);
    }
  }

  // Create indexes
  for (const sql of CREATE_INDEXES_SQL) {
    try {
      await db.$executeRawUnsafe(sql);
    } catch {
      // Ignore index creation errors - not critical
    }
  }

  return { created, errors };
}

/**
 * Add missing columns to existing tables.
 * Handles the case where tables exist but are missing columns.
 */
async function autoMigrate(): Promise<string[]> {
  const results: string[] = [];

  const expectedColumns: Record<string, Array<{ name: string; type: string; default?: string }>> = {
    User: [
      { name: 'name', type: 'TEXT', default: null },
      { name: 'staffRole', type: 'TEXT', default: null },
      { name: 'permissions', type: 'TEXT', default: "'[]'" },
      { name: 'isActive', type: 'BOOLEAN', default: '1' },
    ],
    Session: [
      { name: 'userAgent', type: 'TEXT', default: null },
      { name: 'ipAddress', type: 'TEXT', default: null },
      { name: 'lastActivity', type: 'DATETIME', default: "CURRENT_TIMESTAMP" },
    ],
    LoginLog: [
      { name: 'userId', type: 'TEXT', default: null },
      { name: 'email', type: 'TEXT', default: null },
      { name: 'success', type: 'BOOLEAN', default: '0' },
      { name: 'failureReason', type: 'TEXT', default: null },
      { name: 'ipAddress', type: 'TEXT', default: null },
      { name: 'userAgent', type: 'TEXT', default: null },
      { name: 'country', type: 'TEXT', default: null },
      { name: 'city', type: 'TEXT', default: null },
    ],
    Agency: [
      { name: 'agencyTypeId', type: 'TEXT', default: null },
      { name: 'logoUrl', type: 'TEXT', default: null },
      { name: 'primaryColor', type: 'TEXT', default: "'#2563EB'" },
      { name: 'secondaryColor', type: 'TEXT', default: "'#F59E0B'" },
      { name: 'customMessage', type: 'TEXT', default: null },
      { name: 'contactEmail', type: 'TEXT', default: null },
      { name: 'contactPhone', type: 'TEXT', default: null },
      { name: 'active', type: 'BOOLEAN', default: '1' },
      { name: 'onboardingCompleted', type: 'BOOLEAN', default: '0' },
      { name: 'onboardingStep', type: 'INTEGER', default: '0' },
    ],
  };

  for (const [tableName, columns] of Object.entries(expectedColumns)) {
    try {
      const tableInfo = await db.$queryRawUnsafe(
        `PRAGMA table_info("${tableName}")`
      ) as Array<{ name: string }>;
      const existingColumns = tableInfo.map((col) => col.name);

      for (const col of columns) {
        if (!existingColumns.includes(col.name)) {
          try {
            const defaultClause = col.default ? ` DEFAULT ${col.default}` : '';
            await db.$executeRawUnsafe(
              `ALTER TABLE "${tableName}" ADD COLUMN "${col.name}" ${col.type}${defaultClause}`
            );
            results.push(`Added ${tableName}.${col.name}`);
            console.log(`[auth/init] Migrated: added column ${tableName}.${col.name}`);
          } catch (alterError) {
            const msg = alterError instanceof Error ? alterError.message : String(alterError);
            if (!msg.includes('duplicate column name')) {
              console.error(`[auth/init] Migration error ${tableName}.${col.name}:`, msg);
            }
          }
        }
      }
    } catch {
      // Table doesn't exist - will be created by ensureTablesExist
    }
  }

  return results;
}

/**
 * Ensure the superadmin user exists in the database.
 * Uses multiple strategies: Prisma ORM → Raw SQL → Fallback
 */
async function ensureAdminUser(): Promise<{ created: boolean; email: string; error?: string }> {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@qrtags.com').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const adminName = process.env.ADMIN_NAME || 'Super Admin QRTags';

  // Strategy 1: Try Prisma ORM
  try {
    const existing = await db.user.findUnique({
      where: { email: adminEmail },
      select: { id: true },
    });
    if (existing) {
      console.log(`[auth/init] Admin already exists: ${adminEmail}`);
      return { created: false, email: adminEmail };
    }
  } catch {
    // Prisma query failed - table might not exist or have wrong schema
    console.log('[auth/init] Prisma findUnique failed, trying raw SQL...');
  }

  // Strategy 2: Try raw SQL to check if admin exists
  try {
    const rawResult = await db.$queryRawUnsafe(
      `SELECT id FROM User WHERE email = ? LIMIT 1`,
      adminEmail
    ) as Array<{ id: string }>;
    if (rawResult.length > 0) {
      console.log(`[auth/init] Admin exists (raw query): ${adminEmail}`);
      return { created: false, email: adminEmail };
    }
  } catch {
    console.log('[auth/init] Raw SQL check failed, creating admin...');
  }

  // Admin doesn't exist - create it
  const hashedPassword = await bcrypt.hash(adminPassword, 12);

  // Strategy 1: Try Prisma ORM create
  try {
    await db.user.create({
      data: {
        email: adminEmail,
        name: adminName,
        password: hashedPassword,
        role: 'superadmin',
        permissions: JSON.stringify([
          'VIEW_DASHBOARD', 'MANAGE_TAGS', 'MANAGE_AGENCIES', 'MANAGE_USERS',
          'MANAGE_AGENCY_TYPES', 'MANAGE_SUBSCRIPTIONS', 'MANAGE_PAYMENTS',
          'MANAGE_SETTINGS', 'MANAGE_FEATURES', 'VIEW_WALLET', 'MANAGE_STAFF',
          'MANAGE_WHITE_LABEL', 'MANAGE_MESSAGES', 'MANAGE_BLOG',
          'MANAGE_ADVERTISEMENTS', 'MANAGE_CRM', 'VIEW_REPORTS',
          'MANAGE_BACKUP', 'MANAGE_SECURITY',
        ]),
        isActive: true,
      },
    });
    console.log(`[auth/init] ✓ SuperAdmin created via Prisma: ${adminEmail}`);
    return { created: true, email: adminEmail };
  } catch (prismaErr) {
    console.error('[auth/init] Prisma create failed:', prismaErr instanceof Error ? prismaErr.message : prismaErr);
  }

  // Strategy 2: Try raw SQL create
  const id = `cm_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const now = new Date().toISOString();
  try {
    await db.$executeRawUnsafe(
      `INSERT INTO User (id, email, name, password, role, permissions, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      id, adminEmail, adminName, hashedPassword, 'superadmin',
      JSON.stringify(['VIEW_DASHBOARD', 'MANAGE_TAGS', 'MANAGE_AGENCIES', 'MANAGE_USERS',
        'MANAGE_AGENCY_TYPES', 'MANAGE_SUBSCRIPTIONS', 'MANAGE_PAYMENTS',
        'MANAGE_SETTINGS', 'MANAGE_FEATURES', 'VIEW_WALLET', 'MANAGE_STAFF',
        'MANAGE_WHITE_LABEL', 'MANAGE_MESSAGES', 'MANAGE_BLOG',
        'MANAGE_ADVERTISEMENTS', 'MANAGE_CRM', 'VIEW_REPORTS',
        'MANAGE_BACKUP', 'MANAGE_SECURITY']),
      now, now
    );
    console.log(`[auth/init] ✓ SuperAdmin created via raw SQL: ${adminEmail}`);
    return { created: true, email: adminEmail };
  } catch (rawErr) {
    const errMsg = rawErr instanceof Error ? rawErr.message : String(rawErr);
    console.error('[auth/init] ✗ Raw SQL create also failed:', errMsg);
    return { created: false, email: adminEmail, error: errMsg };
  }
}

/**
 * POST /api/auth/init
 * Full database initialization: ensure tables → migrate columns → create admin.
 * Called automatically by the login page on first load.
 */
export async function POST() {
  try {
    console.log('[auth/init] ═══ Starting full database initialization ═══');

    // Step 1: Ensure all required tables exist (raw SQL CREATE TABLE IF NOT EXISTS)
    console.log('[auth/init] Step 1: Ensuring tables exist...');
    const tablesResult = await ensureTablesExist();
    console.log(`[auth/init] Tables ensured: ${tablesResult.created.length} OK, ${tablesResult.errors.length} errors`);

    // Step 2: Migrate missing columns
    console.log('[auth/init] Step 2: Running column migrations...');
    const migrationResults = await autoMigrate();

    // Step 3: Ensure admin user exists
    console.log('[auth/init] Step 3: Ensuring admin user...');
    const adminResult = await ensureAdminUser();

    console.log('[auth/init] ═══ Initialization complete ═══');

    return NextResponse.json({
      success: true,
      tables: tablesResult.created,
      tableErrors: tablesResult.errors,
      migrated: migrationResults,
      admin: adminResult,
      warning: adminResult.created ? 'Change the default password after first login!' : undefined,
    });
  } catch (error) {
    console.error('[auth/init] Fatal error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to initialize',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/init
 * Check database health and admin status.
 */
export async function GET() {
  try {
    // Ensure tables exist (lightweight check)
    const tablesResult = await ensureTablesExist();
    const migrationResults = await autoMigrate();
    const adminResult = await ensureAdminUser();

    return NextResponse.json({
      success: true,
      tables: tablesResult.created,
      tableErrors: tablesResult.errors,
      migrated: migrationResults,
      admin: {
        exists: !adminResult.created,
        email: adminResult.email,
        error: adminResult.error,
      },
    });
  } catch (error) {
    console.error('[auth/init] Error checking:', error);
    return NextResponse.json(
      {
        success: false,
        error: String(error),
        admin: { exists: false },
      },
      { status: 500 }
    );
  }
}
