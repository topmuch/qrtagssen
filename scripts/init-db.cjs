#!/usr/bin/env node
/**
 * QRTags - Robust Database Initialization Script
 *
 * This script ensures the SQLite database has all required tables and the admin user.
 * It uses a multi-strategy approach:
 * 1. Try `prisma db push` (ideal case)
 * 2. If that fails, create tables manually using raw SQL (failsafe)
 * 3. Verify critical tables exist
 * 4. Create the default admin user
 *
 * Usage: node scripts/init-db.cjs
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Force DATABASE_URL for Docker environment
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:/app/data/qrtags.db';
  console.log('[init-db] Set DATABASE_URL to:', process.env.DATABASE_URL);
}

console.log('[init-db] ═══ Starting database initialization ═══');
console.log('[init-db] DATABASE_URL:', process.env.DATABASE_URL);

// Extract DB file path from DATABASE_URL
const dbPath = process.env.DATABASE_URL.replace('file:', '');
const dbDir = path.dirname(dbPath);

// Ensure directory exists
try {
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`[init-db] Created directory: ${dbDir}`);
  }
} catch (err) {
  console.error('[init-db] Failed to create directory:', err.message);
}

const prisma = new PrismaClient({ log: ['error'] });

// ═══════════════════════════════════════════════════
// FULL TABLE CREATION SQL (SQLite)
// ═══════════════════════════════════════════════════

const CREATE_TABLES_SQL = [
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
  `CREATE TABLE IF NOT EXISTS "WalletTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "referenceId" TEXT,
    "referenceType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL UNIQUE,
    "agencyId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "description" TEXT,
    "items" TEXT NOT NULL,
    "dueDate" DATETIME,
    "paidAt" DATETIME,
    "paymentMethod" TEXT,
    "pdfUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("agencyId") REFERENCES "Agency"("id"),
    FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "EmailSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL DEFAULT 'console',
    "fromEmail" TEXT NOT NULL DEFAULT 'noreply@qrtags.com',
    "fromName" TEXT NOT NULL DEFAULT 'QRTags',
    "recipientEmail" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUser" TEXT,
    "smtpPassword" TEXT,
    "smtpEncryption" TEXT NOT NULL DEFAULT 'tls',
    "isActive" BOOLEAN NOT NULL DEFAULT 1,
    "lastTestAt" DATETIME,
    "lastTestStatus" TEXT,
    "lastTestError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "EmailLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "userId" TEXT,
    "agencyId" TEXT,
    "data" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "EmailToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL UNIQUE,
    "type" TEXT NOT NULL,
    "code" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT 0,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "company" TEXT,
    "agencyTypeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "source" TEXT,
    "notes" TEXT,
    "agencyId" TEXT,
    "assignedToId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "Observation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "DailyReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
    UNIQUE("userId", "date")
  )`,
  `CREATE TABLE IF NOT EXISTS "Advertisement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT NOT NULL,
    "linkUrl" TEXT,
    "linkTarget" TEXT NOT NULL DEFAULT '_blank',
    "position" TEXT NOT NULL DEFAULT 'footer',
    "targetScope" TEXT NOT NULL DEFAULT 'all',
    "agencyId" TEXT,
    "agencyTypeId" TEXT,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("agencyId") REFERENCES "Agency"("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "AdImpression" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "advertisementId" TEXT NOT NULL,
    "userId" TEXT,
    "agencyId" TEXT,
    "userRole" TEXT,
    "action" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("advertisementId") REFERENCES "Advertisement"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "BlogPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL UNIQUE,
    "content" TEXT NOT NULL,
    "excerpt" TEXT,
    "coverImage" TEXT,
    "category" TEXT NOT NULL DEFAULT 'actualites',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" DATETIME,
    "authorId" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "BlogView" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "userId" TEXT,
    "agencyId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("postId") REFERENCES "BlogPost"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Page" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL UNIQUE,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "Banner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "LossAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tagId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "alertType" TEXT NOT NULL DEFAULT 'no_scan_after_activation',
    "message" TEXT NOT NULL,
    "dismissed" BOOLEAN NOT NULL DEFAULT 0,
    "dismissedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "Checklist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL UNIQUE,
    "verificationKey" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "departureDate" TEXT NOT NULL,
    "destinationCountry" TEXT NOT NULL,
    "items" TEXT NOT NULL,
    "itemsCount" INTEGER NOT NULL DEFAULT 0,
    "photoPath" TEXT,
    "photoSizeBytes" INTEGER NOT NULL DEFAULT 0,
    "pdfPath" TEXT,
    "pdfSizeBytes" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" DATETIME,
    "emailSent" BOOLEAN NOT NULL DEFAULT 0,
    "emailSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "tagRef" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT 0,
    "isApproved" BOOLEAN NOT NULL DEFAULT 0,
    "response" TEXT,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "SMSCredits" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL UNIQUE,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "totalPurchased" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
];

// ═══════════════════════════════════════════════════
// MAIN INITIALIZATION
// ═══════════════════════════════════════════════════

async function main() {
  let tablesOk = false;

  // ── Strategy 1: prisma db push ──
  console.log('[init-db] Strategy 1: Running prisma db push...');
  try {
    execSync('npx prisma db push --skip-generate --accept-data-loss', {
      stdio: 'pipe',
      env: { ...process.env },
      timeout: 30000,
    });
    console.log('[init-db] ✓ prisma db push succeeded');
    tablesOk = true;
  } catch (err) {
    console.error('[init-db] ✗ prisma db push failed:', err.message ? err.message.substring(0, 200) : err);
    console.log('[init-db] Falling back to manual table creation...');
  }

  // ── Strategy 2: Manual table creation via raw SQL ──
  if (!tablesOk) {
    console.log('[init-db] Strategy 2: Creating tables manually...');
    let createdCount = 0;
    let errorCount = 0;

    for (const sql of CREATE_TABLES_SQL) {
      const tableNameMatch = sql.match(/CREATE TABLE IF NOT EXISTS "(\w+)"/);
      const tableName = tableNameMatch ? tableNameMatch[1] : 'unknown';

      try {
        await prisma.$executeRawUnsafe(sql);
        createdCount++;
        console.log(`[init-db] ✓ Table ensured: ${tableName}`);
      } catch (err) {
        errorCount++;
        console.error(`[init-db] ✗ Failed to create table ${tableName}:`, err.message);
      }
    }

    if (createdCount > 0) {
      tablesOk = true;
      console.log(`[init-db] Manual creation: ${createdCount} OK, ${errorCount} errors`);
    }
  }

  // ── Verify critical tables ──
  console.log('[init-db] Verifying critical tables...');
  try {
    const userCount = await prisma.user.count();
    console.log(`[init-db] ✓ User table OK (${userCount} rows)`);
  } catch (err) {
    console.error('[init-db] ✗ User table verification failed:', err.message);
    tablesOk = false;
  }

  try {
    const sessionCount = await prisma.session.count();
    console.log(`[init-db] ✓ Session table OK (${sessionCount} rows)`);
  } catch (err) {
    console.error('[init-db] ✗ Session table verification failed:', err.message);
  }

  // ── Create admin user ──
  console.log('[init-db] Creating admin user...');
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@qrtags.com').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const adminName = process.env.ADMIN_NAME || 'Super Admin QRTags';

  try {
    // Check if admin exists
    let existingAdmin = null;
    try {
      existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
    } catch {
      // Try raw SQL if Prisma fails
      try {
        const result = await prisma.$queryRawUnsafe(
          `SELECT id, email, role FROM User WHERE email = ? LIMIT 1`,
          adminEmail
        );
        existingAdmin = result[0] || null;
      } catch {
        // Table might not exist
      }
    }

    if (existingAdmin) {
      // Verify password matches - reset if not
      console.log(`[init-db] Admin user already exists: ${adminEmail}, verifying password...`);
      let passwordOk = false;
      try {
        // Get the password hash
        let adminRow = null;
        try {
          adminRow = await prisma.user.findUnique({ where: { email: adminEmail }, select: { id: true, password: true, role: true, isActive: true } });
        } catch {
          try {
            const rows = await prisma.$queryRawUnsafe(`SELECT id, password, role, isActive FROM User WHERE email = ? LIMIT 1`, adminEmail);
            adminRow = rows[0] || null;
          } catch { /* ignore */ }
        }

        if (adminRow && adminRow.password) {
          passwordOk = await bcrypt.compare(adminPassword, adminRow.password);
        }

        if (!passwordOk) {
          console.log(`[init-db] Admin password mismatch, resetting...`);
          const newHash = await bcrypt.hash(adminPassword, 12);
          try {
            await prisma.user.update({
              where: { id: adminRow.id },
              data: { password: newHash, role: 'superadmin', isActive: true },
            });
            console.log(`[init-db] ✓ Admin password reset: ${adminEmail}`);
          } catch (updateErr) {
            // Try raw SQL
            try {
              await prisma.$executeRawUnsafe(
                `UPDATE User SET password = ?, role = 'superadmin', isActive = 1 WHERE id = ?`,
                newHash, adminRow.id
              );
              console.log(`[init-db] ✓ Admin password reset (raw SQL): ${adminEmail}`);
            } catch (rawErr) {
              console.error(`[init-db] ✗ Password reset failed:`, rawErr.message);
            }
          }
        } else {
          console.log(`[init-db] ✓ Admin password verified OK`);
        }
      } catch (verifyErr) {
        console.error(`[init-db] Password verification error:`, verifyErr.message);
      }
    } else {
      // Create admin
      const hashedPassword = await bcrypt.hash(adminPassword, 12);

      try {
        await prisma.user.create({
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
          }
        });
        console.log(`[init-db] ✓ SuperAdmin created: ${adminEmail}`);
      } catch (createErr) {
        // Fallback: raw SQL
        console.error('[init-db] Prisma create failed, trying raw SQL:', createErr.message);
        const id = `cm_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const now = new Date().toISOString();
        try {
          await prisma.$executeRawUnsafe(
            `INSERT INTO User (id, email, name, password, role, permissions, isActive, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
            id, adminEmail, adminName, hashedPassword, 'superadmin',
            JSON.stringify(['VIEW_DASHBOARD', 'MANAGE_TAGS', 'MANAGE_AGENCIES']),
            now, now
          );
          console.log(`[init-db] ✓ SuperAdmin created via raw SQL: ${adminEmail}`);
        } catch (rawErr) {
          console.error('[init-db] ✗ Raw SQL create also failed:', rawErr.message);
        }
      }
    }
  } catch (err) {
    console.error('[init-db] Admin user creation error:', err.message);
  }

  console.log('[init-db] ═══ Initialization complete ═══');
}

main()
  .catch(err => {
    console.error('[init-db] Fatal error:', err);
    process.exitCode = 0; // Don't block server start
  })
  .finally(() => prisma.$disconnect());
