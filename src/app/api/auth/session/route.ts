import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { cookies } from 'next/headers';

// Get current session from server-side cookie
export async function GET(request: NextRequest) {
  try {
    // Try the normal session first (cookie-based with Session table)
    const user = await getSession();

    if (user) {
      return NextResponse.json({
        authenticated: true,
        user
      });
    }

    // Fallback: check qrtags_user_id cookie if Session table failed
    try {
      const cookieStore = await cookies();
      const userId = cookieStore.get('qrtags_user_id')?.value;
      const userRole = cookieStore.get('qrtags_user_role')?.value;

      if (userId) {
        console.log('[session] Fallback: checking user by cookie:', userId);
        const dbUser = await db.user.findUnique({
          where: { id: userId },
          include: {
            agency: {
              select: {
                id: true,
                name: true,
                slug: true,
                email: true,
                phone: true,
                address: true,
              },
            },
          },
        });

        if (dbUser && dbUser.isActive) {
          return NextResponse.json({
            authenticated: true,
            user: {
              id: dbUser.id,
              email: dbUser.email,
              name: dbUser.name,
              role: dbUser.role,
              agencyId: dbUser.agencyId,
              agency: dbUser.agency,
            }
          });
        }
      }
    } catch (fallbackError) {
      console.error('[session] Fallback failed:', fallbackError);
    }

    return NextResponse.json({
      authenticated: false,
      user: null
    });
  } catch (error) {
    console.error('Session check error:', error);
    return NextResponse.json(
      { authenticated: false, user: null },
      { status: 500 }
    );
  }
}
