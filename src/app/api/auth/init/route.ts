import { NextResponse } from 'next/server';
import { initializeDatabase, resetInitFlag } from '@/lib/db-init';

/**
 * POST /api/auth/init
 * Force full database initialization: ensure tables → ensure admin.
 * Called automatically by the login page on first load.
 * Also resets admin password if it doesn't match the default.
 */
export async function POST() {
  try {
    // Force re-init (reset the one-time flag)
    resetInitFlag();
    const result = await initializeDatabase();

    return NextResponse.json({
      success: true,
      tables: result.tables.created,
      tableErrors: result.tables.errors,
      admin: {
        created: result.admin.created,
        reset: result.admin.reset,
        email: result.admin.email,
        error: result.admin.error,
      },
      warning: result.admin.created || result.admin.reset
        ? 'Admin password has been set to default. Change it after login!'
        : undefined,
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
    resetInitFlag();
    const result = await initializeDatabase();

    return NextResponse.json({
      success: true,
      tables: result.tables.created,
      tableErrors: result.tables.errors,
      admin: {
        exists: !result.admin.created,
        reset: result.admin.reset,
        email: result.admin.email,
        error: result.admin.error,
      },
    });
  } catch (error) {
    console.error('[auth/init] Error:', error);
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
