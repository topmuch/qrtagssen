#!/usr/bin/env node
/**
 * QRTags - Robust Database Initialization Script
 *
 * This script ensures the SQLite database has all required tables, columns,
 * and the admin user. It uses a multi-strategy approach:
 * 1. Try `prisma db push` (ideal case)
 * 2. If that fails, create tables manually using raw SQL (failsafe)
 * 3. CRITICAL: Add missing columns to existing tables via ALTER TABLE
 * 4. Verify critical tables exist
 * 5. Create/verify the default admin user
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
// COLUMN MIGRATIONS
// CREATE TABLE IF NOT EXISTS does NOT add missing columns.
// We must ALTER TABLE to add them.
// ═══════════════════════════════════════════════════

const COLUMN_MIGRATIONS = {
  User: [
    { name: 'name', definition: 'TEXT' },
    { name: 'password', definition: 'TEXT' },
    { name: 'role', definition: "TEXT NOT NULL DEFAULT 'agency'" },
    { name: 'agencyId', definition: 'TEXT' },
    { name: 'staffRole', definition: 'TEXT' },
    { name: 'permissions', definition: "TEXT NOT NULL DEFAULT '[]'" },
    { name: 'isActive', definition: 'BOOLEAN NOT NULL DEFAULT 1' },
    { name: 'createdAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updatedAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  Session: [
    { name: 'userId', definition: 'TEXT NOT NULL' },
    { name: 'userAgent', definition: 'TEXT' },
    { name: 'ipAddress', definition: 'TEXT' },
    { name: 'lastActivity', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { name: 'expiresAt', definition: 'DATETIME NOT NULL' },
    { name: 'createdAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  LoginLog: [
    { name: 'userId', definition: 'TEXT' },
    { name: 'email', definition: 'TEXT NOT NULL' },
    { name: 'success', definition: 'BOOLEAN NOT NULL DEFAULT 0' },
    { name: 'failureReason', definition: 'TEXT' },
    { name: 'ipAddress', definition: 'TEXT' },
    { name: 'userAgent', definition: 'TEXT' },
    { name: 'country', definition: 'TEXT' },
    { name: 'city', definition: 'TEXT' },
    { name: 'createdAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  AgencyType: [
    { name: 'name', definition: 'TEXT NOT NULL UNIQUE' },
    { name: 'label', definition: 'TEXT NOT NULL' },
    { name: 'icon', definition: 'TEXT NOT NULL' },
    { name: 'description', definition: 'TEXT' },
    { name: 'customFields', definition: "TEXT NOT NULL DEFAULT '[]'" },
    { name: 'color', definition: "TEXT NOT NULL DEFAULT '#2563EB'" },
    { name: 'isActive', definition: 'BOOLEAN NOT NULL DEFAULT 1' },
    { name: 'sortOrder', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'createdAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updatedAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  Agency: [
    { name: 'name', definition: 'TEXT NOT NULL' },
    { name: 'slug', definition: 'TEXT NOT NULL UNIQUE' },
    { name: 'agencyTypeId', definition: 'TEXT NOT NULL' },
    { name: 'email', definition: 'TEXT' },
    { name: 'phone', definition: 'TEXT' },
    { name: 'address', definition: 'TEXT' },
    { name: 'city', definition: 'TEXT' },
    { name: 'country', definition: 'TEXT' },
    { name: 'logoUrl', definition: 'TEXT' },
    { name: 'primaryColor', definition: "TEXT NOT NULL DEFAULT '#2563EB'" },
    { name: 'secondaryColor', definition: "TEXT NOT NULL DEFAULT '#F59E0B'" },
    { name: 'customMessage', definition: 'TEXT' },
    { name: 'contactEmail', definition: 'TEXT' },
    { name: 'contactPhone', definition: 'TEXT' },
    { name: 'active', definition: 'BOOLEAN NOT NULL DEFAULT 1' },
    { name: 'onboardingCompleted', definition: 'BOOLEAN NOT NULL DEFAULT 0' },
    { name: 'onboardingStep', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'createdAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updatedAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  Tag: [
    { name: 'serialNumber', definition: 'TEXT NOT NULL UNIQUE' },
    { name: 'qrCodeUrl', definition: 'TEXT' },
    { name: 'tagType', definition: "TEXT NOT NULL DEFAULT 'standard'" },
    { name: 'agencyId', definition: 'TEXT' },
    { name: 'status', definition: "TEXT NOT NULL DEFAULT 'created'" },
    { name: 'customData', definition: "TEXT NOT NULL DEFAULT '{}'" },
    { name: 'ownerName', definition: 'TEXT' },
    { name: 'ownerPhone', definition: 'TEXT' },
    { name: 'ownerEmail', definition: 'TEXT' },
    { name: 'itemName', definition: 'TEXT' },
    { name: 'itemDescription', definition: 'TEXT' },
    { name: 'itemCategory', definition: 'TEXT' },
    { name: 'locationBuilding', definition: 'TEXT' },
    { name: 'locationRoom', definition: 'TEXT' },
    { name: 'locationNote', definition: 'TEXT' },
    { name: 'activatedAt', definition: 'DATETIME' },
    { name: 'expiresAt', definition: 'DATETIME' },
    { name: 'lastScanDate', definition: 'DATETIME' },
    { name: 'lastLocation', definition: 'TEXT' },
    { name: 'declaredLostAt', definition: 'DATETIME' },
    { name: 'foundAt', definition: 'DATETIME' },
    { name: 'founderName', definition: 'TEXT' },
    { name: 'founderPhone', definition: 'TEXT' },
    { name: 'founderEmail', definition: 'TEXT' },
    { name: 'founderMessage', definition: 'TEXT' },
    { name: 'founderAt', definition: 'DATETIME' },
    { name: 'setId', definition: 'TEXT' },
    { name: 'createdAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updatedAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  ScanLog: [
    { name: 'tagId', definition: 'TEXT NOT NULL' },
    { name: 'scannedBy', definition: 'TEXT' },
    { name: 'scannerId', definition: 'TEXT' },
    { name: 'scanType', definition: "TEXT NOT NULL DEFAULT 'finder'" },
    { name: 'ipAddress', definition: 'TEXT' },
    { name: 'country', definition: 'TEXT' },
    { name: 'city', definition: 'TEXT' },
    { name: 'latitude', definition: 'REAL' },
    { name: 'longitude', definition: 'REAL' },
    { name: 'location', definition: 'TEXT' },
    { name: 'notes', definition: 'TEXT' },
    { name: 'whatsappStatus', definition: 'TEXT' },
    { name: 'aiAnalysis', definition: 'TEXT' },
    { name: 'groqUsed', definition: 'BOOLEAN NOT NULL DEFAULT 0' },
    { name: 'groqLatencyMs', definition: 'INTEGER' },
    { name: 'groqModelUsed', definition: 'TEXT' },
    { name: 'wakitMessageId', definition: 'TEXT' },
    { name: 'context', definition: 'TEXT' },
    { name: 'createdAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  Subscription: [
    { name: 'agencyId', definition: 'TEXT NOT NULL UNIQUE' },
    { name: 'plan', definition: "TEXT NOT NULL DEFAULT 'starter'" },
    { name: 'status', definition: "TEXT NOT NULL DEFAULT 'trial'" },
    { name: 'startDate', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { name: 'endDate', definition: 'DATETIME' },
    { name: 'trialEndsAt', definition: 'DATETIME' },
    { name: 'maxTags', definition: 'INTEGER NOT NULL DEFAULT 50' },
    { name: 'maxUsers', definition: 'INTEGER NOT NULL DEFAULT 5' },
    { name: 'maxScans', definition: 'INTEGER NOT NULL DEFAULT 1000' },
    { name: 'amount', definition: 'REAL NOT NULL DEFAULT 0' },
    { name: 'currency', definition: "TEXT NOT NULL DEFAULT 'XOF'" },
    { name: 'billingCycle', definition: "TEXT NOT NULL DEFAULT 'monthly'" },
    { name: 'createdAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updatedAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  Payment: [
    { name: 'agencyId', definition: 'TEXT NOT NULL' },
    { name: 'subscriptionId', definition: 'TEXT' },
    { name: 'amount', definition: 'REAL NOT NULL' },
    { name: 'currency', definition: "TEXT NOT NULL DEFAULT 'XOF'" },
    { name: 'method', definition: 'TEXT NOT NULL' },
    { name: 'status', definition: "TEXT NOT NULL DEFAULT 'pending'" },
    { name: 'transactionId', definition: 'TEXT' },
    { name: 'phoneNumber', definition: 'TEXT' },
    { name: 'description', definition: 'TEXT' },
    { name: 'paidAt', definition: 'DATETIME' },
    { name: 'createdAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updatedAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  Wallet: [
    { name: 'agencyId', definition: 'TEXT NOT NULL UNIQUE' },
    { name: 'balance', definition: 'REAL NOT NULL DEFAULT 0' },
    { name: 'totalEarned', definition: 'REAL NOT NULL DEFAULT 0' },
    { name: 'totalWithdrawn', definition: 'REAL NOT NULL DEFAULT 0' },
    { name: 'currency', definition: "TEXT NOT NULL DEFAULT 'XOF'" },
    { name: 'createdAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updatedAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  Message: [
    { name: 'type', definition: 'TEXT NOT NULL' },
    { name: 'status', definition: "TEXT NOT NULL DEFAULT 'non_lu'" },
    { name: 'senderName', definition: 'TEXT' },
    { name: 'senderEmail', definition: 'TEXT' },
    { name: 'senderPhone', definition: 'TEXT' },
    { name: 'agencyId', definition: 'TEXT' },
    { name: 'recipientAgencyId', definition: 'TEXT' },
    { name: 'subject', definition: 'TEXT' },
    { name: 'content', definition: 'TEXT NOT NULL' },
    { name: 'tagId', definition: 'TEXT' },
    { name: 'createdAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updatedAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  Notification: [
    { name: 'type', definition: 'TEXT NOT NULL' },
    { name: 'userId', definition: 'TEXT' },
    { name: 'agencyId', definition: 'TEXT' },
    { name: 'tagId', definition: 'TEXT' },
    { name: 'message', definition: 'TEXT NOT NULL' },
    { name: 'data', definition: 'TEXT' },
    { name: 'read', definition: 'BOOLEAN NOT NULL DEFAULT 0' },
    { name: 'createdAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updatedAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  Booking: [
    { name: 'tagId', definition: 'TEXT NOT NULL' },
    { name: 'agencyId', definition: 'TEXT NOT NULL' },
    { name: 'customData', definition: "TEXT NOT NULL DEFAULT '{}'" },
    { name: 'status', definition: "TEXT NOT NULL DEFAULT 'active'" },
    { name: 'activatedAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { name: 'completedAt', definition: 'DATETIME' },
    { name: 'createdAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updatedAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  FeatureFlag: [
    { name: 'key', definition: 'TEXT NOT NULL UNIQUE' },
    { name: 'label', definition: 'TEXT NOT NULL' },
    { name: 'description', definition: 'TEXT NOT NULL' },
    { name: 'category', definition: "TEXT NOT NULL DEFAULT 'general'" },
    { name: 'enabled', definition: 'BOOLEAN NOT NULL DEFAULT 0' },
    { name: 'icon', definition: 'TEXT' },
    { name: 'createdAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updatedAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  Setting: [
    { name: 'key', definition: 'TEXT NOT NULL UNIQUE' },
    { name: 'value', definition: 'TEXT NOT NULL' },
    { name: 'updatedAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  SystemLog: [
    { name: 'level', definition: 'TEXT NOT NULL' },
    { name: 'message', definition: 'TEXT NOT NULL' },
    { name: 'source', definition: 'TEXT NOT NULL' },
    { name: 'metadata', definition: 'TEXT' },
    { name: 'createdAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  WalletTransaction: [
    { name: 'walletId', definition: 'TEXT NOT NULL' },
    { name: 'agencyId', definition: 'TEXT NOT NULL' },
    { name: 'transactionType', definition: 'TEXT NOT NULL' },
    { name: 'amount', definition: 'REAL NOT NULL' },
    { name: 'description', definition: 'TEXT NOT NULL' },
    { name: 'status', definition: "TEXT NOT NULL DEFAULT 'completed'" },
    { name: 'referenceId', definition: 'TEXT' },
    { name: 'referenceType', definition: 'TEXT' },
    { name: 'createdAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  Invoice: [
    { name: 'number', definition: 'TEXT NOT NULL UNIQUE' },
    { name: 'agencyId', definition: 'TEXT NOT NULL' },
    { name: 'subscriptionId', definition: 'TEXT' },
    { name: 'amount', definition: 'REAL NOT NULL' },
    { name: 'currency', definition: "TEXT NOT NULL DEFAULT 'XOF'" },
    { name: 'status', definition: "TEXT NOT NULL DEFAULT 'pending'" },
    { name: 'description', definition: 'TEXT' },
    { name: 'items', definition: 'TEXT NOT NULL' },
    { name: 'dueDate', definition: 'DATETIME' },
    { name: 'paidAt', definition: 'DATETIME' },
    { name: 'paymentMethod', definition: 'TEXT' },
    { name: 'pdfUrl', definition: 'TEXT' },
    { name: 'createdAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updatedAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  Lead: [
    { name: 'name', definition: 'TEXT NOT NULL' },
    { name: 'email', definition: 'TEXT NOT NULL' },
    { name: 'phone', definition: 'TEXT' },
    { name: 'company', definition: 'TEXT' },
    { name: 'agencyTypeId', definition: 'TEXT' },
    { name: 'status', definition: "TEXT NOT NULL DEFAULT 'new'" },
    { name: 'source', definition: 'TEXT' },
    { name: 'notes', definition: 'TEXT' },
    { name: 'agencyId', definition: 'TEXT' },
    { name: 'assignedToId', definition: 'TEXT' },
    { name: 'createdAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updatedAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  Observation: [
    { name: 'leadId', definition: 'TEXT NOT NULL' },
    { name: 'type', definition: 'TEXT NOT NULL' },
    { name: 'content', definition: 'TEXT NOT NULL' },
    { name: 'date', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { name: 'userId', definition: 'TEXT NOT NULL' },
    { name: 'createdAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  DailyReport: [
    { name: 'userId', definition: 'TEXT NOT NULL' },
    { name: 'date', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { name: 'content', definition: 'TEXT NOT NULL' },
    { name: 'createdAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updatedAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  Advertisement: [
    { name: 'title', definition: 'TEXT NOT NULL' },
    { name: 'description', definition: 'TEXT' },
    { name: 'imageUrl', definition: 'TEXT NOT NULL' },
    { name: 'linkUrl', definition: 'TEXT' },
    { name: 'linkTarget', definition: "TEXT NOT NULL DEFAULT '_blank'" },
    { name: 'position', definition: "TEXT NOT NULL DEFAULT 'footer'" },
    { name: 'targetScope', definition: "TEXT NOT NULL DEFAULT 'all'" },
    { name: 'agencyId', definition: 'TEXT' },
    { name: 'agencyTypeId', definition: 'TEXT' },
    { name: 'startDate', definition: 'DATETIME NOT NULL' },
    { name: 'endDate', definition: 'DATETIME' },
    { name: 'status', definition: "TEXT NOT NULL DEFAULT 'draft'" },
    { name: 'priority', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'impressions', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'clicks', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'createdAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updatedAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  BlogPost: [
    { name: 'title', definition: 'TEXT NOT NULL' },
    { name: 'slug', definition: 'TEXT NOT NULL UNIQUE' },
    { name: 'content', definition: 'TEXT NOT NULL' },
    { name: 'excerpt', definition: 'TEXT' },
    { name: 'coverImage', definition: 'TEXT' },
    { name: 'category', definition: "TEXT NOT NULL DEFAULT 'actualites'" },
    { name: 'status', definition: "TEXT NOT NULL DEFAULT 'draft'" },
    { name: 'publishedAt', definition: 'DATETIME' },
    { name: 'authorId', definition: 'TEXT' },
    { name: 'views', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'createdAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updatedAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  Checklist: [
    { name: 'code', definition: 'TEXT NOT NULL UNIQUE' },
    { name: 'verificationKey', definition: 'TEXT NOT NULL' },
    { name: 'firstName', definition: 'TEXT NOT NULL' },
    { name: 'lastName', definition: 'TEXT NOT NULL' },
    { name: 'email', definition: 'TEXT NOT NULL' },
    { name: 'departureDate', definition: 'TEXT NOT NULL' },
    { name: 'destinationCountry', definition: 'TEXT NOT NULL' },
    { name: 'items', definition: 'TEXT NOT NULL' },
    { name: 'itemsCount', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'photoPath', definition: 'TEXT' },
    { name: 'photoSizeBytes', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'pdfPath', definition: 'TEXT' },
    { name: 'pdfSizeBytes', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'viewCount', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'lastViewedAt', definition: 'DATETIME' },
    { name: 'emailSent', definition: 'BOOLEAN NOT NULL DEFAULT 0' },
    { name: 'emailSentAt', definition: 'DATETIME' },
    { name: 'createdAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updatedAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  Review: [
    { name: 'name', definition: 'TEXT NOT NULL' },
    { name: 'location', definition: 'TEXT' },
    { name: 'rating', definition: 'INTEGER NOT NULL' },
    { name: 'title', definition: 'TEXT' },
    { name: 'content', definition: 'TEXT NOT NULL' },
    { name: 'tagRef', definition: 'TEXT' },
    { name: 'isFeatured', definition: 'BOOLEAN NOT NULL DEFAULT 0' },
    { name: 'isApproved', definition: 'BOOLEAN NOT NULL DEFAULT 0' },
    { name: 'response', definition: 'TEXT' },
    { name: 'language', definition: "TEXT NOT NULL DEFAULT 'fr'" },
    { name: 'createdAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updatedAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  SMSCredits: [
    { name: 'agencyId', definition: 'TEXT NOT NULL UNIQUE' },
    { name: 'balance', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'totalPurchased', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'createdAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updatedAt', definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
};

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

  // ── Strategy 3: Add missing columns to existing tables ──
  // This is CRITICAL because CREATE TABLE IF NOT EXISTS does NOT
  // add missing columns to existing tables!
  console.log('[init-db] ═══ Checking for missing columns ═══');
  let columnsAdded = 0;
  let columnErrors = 0;

  for (const [tableName, columns] of Object.entries(COLUMN_MIGRATIONS)) {
    // Get existing columns
    let existingColumns = [];
    try {
      const info = await prisma.$queryRawUnsafe(`PRAGMA table_info("${tableName}")`);
      existingColumns = info.map(col => col.name);
    } catch (err) {
      // Table doesn't exist, skip
      continue;
    }

    for (const col of columns) {
      if (!existingColumns.includes(col.name)) {
        try {
          await prisma.$executeRawUnsafe(
            `ALTER TABLE "${tableName}" ADD COLUMN "${col.name}" ${col.definition}`
          );
          columnsAdded++;
          console.log(`[init-db] ✓ Added column ${tableName}.${col.name}`);
        } catch (err) {
          if (err.message && (err.message.includes('duplicate column') || err.message.includes('already exists'))) {
            // Fine - column was added by another process
            continue;
          }
          columnErrors++;
          console.error(`[init-db] ✗ Failed to add column ${tableName}.${col.name}:`, err.message);
        }
      }
    }
  }

  console.log(`[init-db] Column migration: ${columnsAdded} added, ${columnErrors} errors`);

  // ── Verify critical tables ──
  console.log('[init-db] Verifying critical tables...');
  try {
    // Use raw SQL to avoid Prisma column errors
    const result = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM User`);
    console.log(`[init-db] ✓ User table OK (${result[0].count} rows)`);
  } catch (err) {
    console.error('[init-db] ✗ User table verification failed:', err.message);
  }

  try {
    const result = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM Session`);
    console.log(`[init-db] ✓ Session table OK (${result[0].count} rows)`);
  } catch (err) {
    console.error('[init-db] ✗ Session table verification failed:', err.message);
  }

  // ── Create/verify admin user using raw SQL ──
  console.log('[init-db] Ensuring admin user...');
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@qrtags.com').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const adminName = process.env.ADMIN_NAME || 'Super Admin QRTags';

  try {
    // Check if admin exists using raw SQL
    const existing = await prisma.$queryRawUnsafe(
      `SELECT id, password, role, isActive FROM User WHERE email = ? LIMIT 1`,
      adminEmail
    );

    if (existing.length > 0) {
      const adminRow = existing[0];
      let passwordOk = false;
      if (adminRow.password) {
        passwordOk = await bcrypt.compare(adminPassword, adminRow.password);
      }

      if (passwordOk && adminRow.role === 'superadmin' && adminRow.isActive === 1) {
        console.log(`[init-db] ✓ Admin user verified: ${adminEmail}`);
      } else {
        console.log(`[init-db] Admin needs update (passwordOk=${passwordOk}, role=${adminRow.role}), resetting...`);
        const newHash = await bcrypt.hash(adminPassword, 12);
        try {
          await prisma.$executeRawUnsafe(
            `UPDATE User SET password = ?, role = 'superadmin', isActive = 1 WHERE id = ?`,
            newHash, adminRow.id
          );
          console.log(`[init-db] ✓ Admin user updated: ${adminEmail}`);
        } catch (updateErr) {
          console.error(`[init-db] ✗ Admin update failed:`, updateErr.message);
        }
      }
    } else {
      // Create admin user using raw SQL
      const hashedPassword = await bcrypt.hash(adminPassword, 12);
      const id = `cm_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const now = new Date().toISOString();

      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO User (id, email, name, password, role, permissions, isActive, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          id, adminEmail, adminName, hashedPassword, 'superadmin',
          JSON.stringify([
            'VIEW_DASHBOARD', 'MANAGE_TAGS', 'MANAGE_AGENCIES', 'MANAGE_USERS',
            'MANAGE_AGENCY_TYPES', 'MANAGE_SUBSCRIPTIONS', 'MANAGE_PAYMENTS',
            'MANAGE_SETTINGS', 'MANAGE_FEATURES', 'VIEW_WALLET', 'MANAGE_STAFF',
            'MANAGE_WHITE_LABEL', 'MANAGE_MESSAGES', 'MANAGE_BLOG',
            'MANAGE_ADVERTISEMENTS', 'MANAGE_CRM', 'VIEW_REPORTS',
            'MANAGE_BACKUP', 'MANAGE_SECURITY',
          ]),
          now, now
        );
        console.log(`[init-db] ✓ SuperAdmin created: ${adminEmail}`);
      } catch (createErr) {
        console.error('[init-db] ✗ Admin create failed:', createErr.message);
      }
    }
  } catch (err) {
    console.error('[init-db] Admin user check/create error:', err.message);
  }

  console.log('[init-db] ═══ Initialization complete ═══');
}

main()
  .catch(err => {
    console.error('[init-db] Fatal error:', err);
    process.exitCode = 0; // Don't block server start
  })
  .finally(() => prisma.$disconnect());
