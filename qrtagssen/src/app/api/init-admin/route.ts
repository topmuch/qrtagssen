import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

// GET /api/init-admin - Create default superadmin if none exists
// This is called automatically on first container startup
export async function GET(request: NextRequest) {
  try {
    // Security: Only allow from localhost or with a secret key
    const authHeader = request.headers.get('authorization');
    const initKey = process.env.INIT_ADMIN_KEY || 'qrtags-init-2024';
    
    if (authHeader !== `Bearer ${initKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if any superadmin already exists
    const existingAdmin = await db.user.findFirst({
      where: { role: 'superadmin' }
    });

    if (existingAdmin) {
      return NextResponse.json({ 
        message: 'SuperAdmin already exists',
        email: existingAdmin.email,
      });
    }

    // Create default superadmin
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@qrtags.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const adminName = process.env.ADMIN_NAME || 'Super Admin QRTags';

    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    const admin = await db.user.create({
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

    return NextResponse.json({ 
      message: 'SuperAdmin created successfully',
      email: adminEmail,
      warning: 'Change the default password after first login!',
    });
  } catch (error) {
    console.error('Init admin error:', error);
    return NextResponse.json({ 
      error: 'Failed to create admin',
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

// POST /api/init-admin - Alternative method using POST
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, email, password, name } = body;
    
    // Security check
    const initKey = process.env.INIT_ADMIN_KEY || 'qrtags-init-2024';
    if (key !== initKey) {
      return NextResponse.json({ error: 'Invalid initialization key' }, { status: 401 });
    }

    // Check if superadmin already exists
    const existingAdmin = await db.user.findFirst({
      where: { role: 'superadmin' }
    });

    if (existingAdmin) {
      return NextResponse.json({ message: 'SuperAdmin already exists', email: existingAdmin.email });
    }

    const adminEmail = email || 'admin@qrtags.com';
    const adminPassword = password || 'admin123';
    const adminName = name || 'Super Admin QRTags';

    const hashedPassword = await bcrypt.hash(adminPassword, 12);

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
      }
    });

    return NextResponse.json({ message: 'SuperAdmin created', email: adminEmail });
  } catch (error) {
    console.error('Init admin error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
