import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = Date.now();
  
  try {
    // Check database connectivity
    await db.$queryRaw`SELECT 1`;
    
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      status: 'healthy',
      service: 'QRTags',
      version: '0.2.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      responseTime: `${responseTime}ms`,
      environment: process.env.NODE_ENV || 'unknown',
      database: 'connected',
      checks: {
        database: 'ok',
        memory: {
          used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
          total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
          rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
        },
      },
    }, { status: 200 });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      status: 'unhealthy',
      service: 'QRTags',
      version: '0.2.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      responseTime: `${responseTime}ms`,
      environment: process.env.NODE_ENV || 'unknown',
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown database error',
      checks: {
        database: 'failed',
      },
    }, { status: 503 });
  }
}
