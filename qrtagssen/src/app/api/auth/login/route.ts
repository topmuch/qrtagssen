import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { initializeDatabase, ensureAdminUser } from '@/lib/db-init';
import { cookies } from 'next/headers';

/**
 * Safely log a login attempt - never throws, handles missing columns gracefully
 */
async function safeLogLoginAttempt(params: {
  userId?: string;
  email: string;
  success: boolean;
  failureReason?: string;
}) {
  try {
    // Use raw SQL to avoid Prisma column errors
    const id = `ll_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();
    await db.$executeRawUnsafe(
      `INSERT INTO LoginLog (id, userId, email, success, failureReason, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      params.userId || null,
      params.email,
      params.success ? 1 : 0,
      params.failureReason || null,
      now
    );
  } catch (error) {
    // Never throw - login logging is non-critical
    console.error('[login] Failed to log login attempt:', error instanceof Error ? error.message : error);
  }
}

/**
 * Find user by email - tries Prisma first, falls back to raw SQL
 * with DYNAMIC column detection to handle missing columns.
 */
async function findUser(email: string): Promise<{
  id: string;
  email: string;
  name: string | null;
  password: string | null;
  role: string;
  agencyId: string | null;
  isActive: boolean;
  agency: unknown;
} | null> {
  const emailLower = email.toLowerCase();

  // Try Prisma ORM first
  try {
    const user = await db.user.findUnique({
      where: { email: emailLower },
      include: { agency: true },
    });
    return user;
  } catch (prismaError) {
    console.error('[login] Prisma findUnique failed, trying raw SQL:', prismaError instanceof Error ? prismaError.message : prismaError);
  }

  // Fallback: raw SQL query with DYNAMIC column detection
  // This handles the case where columns like `password` don't exist yet
  try {
    const tableInfo = await db.$queryRawUnsafe(
      `PRAGMA table_info("User")`
    ) as Array<{ name: string }>;
    const existingColumns = tableInfo.map((col) => col.name);

    // Build SELECT with only existing columns - ALL conditional
    const selectCols = [
      'id',
      'email',
      existingColumns.includes('name') ? 'name' : 'NULL as name',
      existingColumns.includes('password') ? 'password' : 'NULL as password',
      existingColumns.includes('role') ? 'role' : "'agency' as role",
      existingColumns.includes('agencyId') ? 'agencyId' : 'NULL as agencyId',
      existingColumns.includes('isActive') ? 'isActive' : '1 as isActive',
    ].join(', ');

    const users = await db.$queryRawUnsafe(
      `SELECT ${selectCols} FROM User WHERE email = ? LIMIT 1`,
      emailLower
    ) as Array<{
      id: string;
      email: string;
      name: string | null;
      password: string | null;
      role: string;
      agencyId: string | null;
      isActive: number;
    }>;

    if (users.length === 0) return null;

    const u = users[0];
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      password: u.password,
      role: u.role,
      agencyId: u.agencyId,
      isActive: !!u.isActive,
      agency: null,
    };
  } catch (rawError) {
    console.error('[login] Raw SQL also failed:', rawError instanceof Error ? rawError.message : rawError);
    return null;
  }
}

export async function POST(request: NextRequest) {
  let email = '';
  let password = '';
  let role = '';

  try {
    const body = await request.json();
    email = body.email || '';
    password = body.password || '';
    role = body.role || '';

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email et mot de passe requis' },
        { status: 400 }
      );
    }

    console.log(`[login] Attempt: email=${email.toLowerCase()}, role=${role}`);

    // ── Step 1: Ensure database is fully initialized ──
    // This creates tables AND adds missing columns via ALTER TABLE
    try {
      const initResult = await initializeDatabase();
      if (initResult.columns.migrated.length > 0) {
        console.log(`[login] DB columns migrated: ${initResult.columns.migrated.join(', ')}`);
      }
    } catch (initErr) {
      console.error('[login] DB init failed (non-fatal):', initErr instanceof Error ? initErr.message : initErr);
    }

    // Rechercher l'utilisateur (with fallback for missing columns/tables)
    let user = await findUser(email);

    // ── Step 2: Force admin user creation if not found ──
    if (!user) {
      console.log(`[login] User not found, forcing admin check...`);
      try {
        const adminResult = await ensureAdminUser();
        console.log(`[login] Admin check result: created=${adminResult.created}, reset=${adminResult.reset}, email=${adminResult.email}`);

        // Try finding user again after admin creation
        user = await findUser(email);
      } catch (initErr) {
        console.error(`[login] Admin check failed:`, initErr);
      }
    }

    if (!user) {
      console.log(`[login] User not found: ${email}`);
      await safeLogLoginAttempt({
        email,
        success: false,
        failureReason: 'Utilisateur non trouvé',
      });

      return NextResponse.json(
        { error: 'Identifiants incorrects' },
        { status: 401 }
      );
    }

    console.log(`[login] User found: ${user.email}, role=${user.role}, isActive=${user.isActive}, hasPassword=${!!user.password}`);

    // Vérifier que le compte est actif
    if (!user.isActive) {
      await safeLogLoginAttempt({
        userId: user.id,
        email,
        success: false,
        failureReason: 'Compte désactivé',
      });

      return NextResponse.json(
        { error: 'Votre compte a été désactivé. Contactez un administrateur.' },
        { status: 403 }
      );
    }

    // Vérifier le mot de passe
    let isValidPassword = user.password ? await bcrypt.compare(password, user.password) : false;

    // ── Step 3: Password reset fallback for admin ──
    // If the admin's password doesn't match (or is null/missing),
    // force-reset it via ensureAdminUser().
    // This handles:
    //   - Missing `password` column that was just added by ALTER TABLE
    //   - Corrupted password hash
    //   - Admin created with different ADMIN_PASSWORD env var
    if (!isValidPassword) {
      const adminEmail = (process.env.ADMIN_EMAIL || 'admin@qrtags.com').toLowerCase();
      if (email.toLowerCase() === adminEmail) {
        console.log(`[login] Admin password mismatch, forcing password reset...`);
        try {
          const resetResult = await ensureAdminUser();
          console.log(`[login] Password reset result: created=${resetResult.created}, reset=${resetResult.reset}`);

          if (resetResult.created || resetResult.reset) {
            // Re-fetch the user with the new password
            user = await findUser(email);
            if (user && user.password) {
              isValidPassword = await bcrypt.compare(password, user.password);
              console.log(`[login] After reset, password valid: ${isValidPassword}`);
            }
          }
        } catch (resetErr) {
          console.error(`[login] Password reset attempt failed:`, resetErr);
        }
      }
    }

    if (!isValidPassword) {
      console.log(`[login] Invalid password for: ${email}`);
      await safeLogLoginAttempt({
        userId: user.id,
        email,
        success: false,
        failureReason: 'Mot de passe incorrect',
      });

      return NextResponse.json(
        { error: 'Identifiants incorrects' },
        { status: 401 }
      );
    }

    // Vérifier le rôle
    if ((role === 'admin' || role === 'superadmin') && user.role !== 'superadmin') {
      console.log(`[login] Role denied: ${user.role} tried admin access`);
      await safeLogLoginAttempt({
        userId: user.id,
        email,
        success: false,
        failureReason: 'Accès admin non autorisé',
      });

      return NextResponse.json(
        { error: 'Accès non autorisé - Administrateur requis' },
        { status: 403 }
      );
    }

    if (role === 'agency' && user.role !== 'agency' && user.role !== 'superadmin') {
      await safeLogLoginAttempt({
        userId: user.id,
        email,
        success: false,
        failureReason: 'Accès agence non autorisé',
      });

      return NextResponse.json(
        { error: 'Accès non autorisé - Agence requise' },
        { status: 403 }
      );
    }

    // ── Create session and set cookies ──
    let sessionCreated = false;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    try {
      const session = await db.session.create({
        data: {
          userId: user.id,
          expiresAt,
          ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                     request.headers.get('x-real-ip') || null,
          userAgent: request.headers.get('user-agent') || null,
          lastActivity: new Date(),
        },
      });

      const cookieStore = await cookies();
      cookieStore.set('qrtags_session', session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        expires: expiresAt,
        path: '/',
      });

      sessionCreated = true;
      console.log(`[login] Session created for: ${email}`);
    } catch (sessionError) {
      console.error('[login] Session creation failed:', sessionError instanceof Error ? sessionError.message : sessionError);
    }

    // Set fallback cookies
    try {
      const cookieStore = await cookies();
      cookieStore.set('qrtags_user_id', user.id, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        expires: expiresAt,
        path: '/',
      });
      cookieStore.set('qrtags_user_role', user.role, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        expires: expiresAt,
        path: '/',
      });
    } catch (cookieError) {
      console.error('[login] Fallback cookie failed:', cookieError instanceof Error ? cookieError.message : cookieError);
    }

    // Log successful login
    await safeLogLoginAttempt({
      userId: user.id,
      email,
      success: true,
    });

    console.log(`[login] Success: ${email}`);

    // Return user data
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        agencyId: user.agencyId,
        agency: user.agency,
      },
      redirectUrl: user.role === 'superadmin' ? '/admin/tableau-de-bord' : '/agence/tableau-de-bord',
      sessionCreated,
    });
  } catch (error) {
    console.error('[login] Server error:', error);

    await safeLogLoginAttempt({
      email,
      success: false,
      failureReason: 'Erreur serveur',
    });

    const errorDetail = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : 'UNKNOWN';

    console.error('[login] Error detail:', errorDetail);

    return NextResponse.json(
      {
        error: 'Erreur serveur',
        detail: errorDetail,
        code: errorName,
      },
      { status: 500 }
    );
  }
}
