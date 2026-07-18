import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuthApi } from '@/lib/auth-middleware';
import { AGENCY_TYPES, AGENCY_TYPE_LIST, type AgencyType as AgencyTypeEnum } from '@/lib/agency-types';

// GET - List all agency types
export async function GET() {
  try {
    await requireAuthApi();

    // Fetch existing agency types from DB
    const dbTypes = await db.agencyType.findMany({
      include: { _count: { select: { agencies: true } } },
      orderBy: { sortOrder: 'asc' },
    });

    // If no types in DB yet, seed them from static definitions
    if (dbTypes.length === 0) {
      const seedData = AGENCY_TYPE_LIST.map((typeKey, index) => ({
        name: typeKey,
        label: AGENCY_TYPES[typeKey].name,
        icon: AGENCY_TYPES[typeKey].icon,
        color: AGENCY_TYPES[typeKey].color,
        customFields: JSON.stringify(AGENCY_TYPES[typeKey].fields),
        isActive: true,
        sortOrder: index,
      }));

      await db.agencyType.createMany({ data: seedData });

      const seededTypes = await db.agencyType.findMany({
        include: { _count: { select: { agencies: true } } },
        orderBy: { sortOrder: 'asc' },
      });

      return NextResponse.json({ types: seededTypes });
    }

    return NextResponse.json({ types: dbTypes });
  } catch (error) {
    console.error('Error fetching agency types:', error);
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST - Create a new agency type
export async function POST(request: NextRequest) {
  try {
    await requireAuthApi();

    const body = await request.json();
    const { name, label, icon, color } = body;

    if (!name || !label) {
      return NextResponse.json({ error: 'Le nom et le label sont requis' }, { status: 400 });
    }

    // Check if name already exists
    const existing = await db.agencyType.findUnique({ where: { name } });
    if (existing) {
      return NextResponse.json({ error: 'Ce nom de type existe déjà' }, { status: 400 });
    }

    // Get max sortOrder
    const maxSort = await db.agencyType.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const agencyType = await db.agencyType.create({
      data: {
        name,
        label,
        icon: icon || 'Layers',
        color: color || '#10B981',
        customFields: JSON.stringify([]),
        isActive: true,
        sortOrder: (maxSort?.sortOrder ?? -1) + 1,
      },
    });

    return NextResponse.json({ agencyType });
  } catch (error) {
    console.error('Error creating agency type:', error);
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// PATCH - Update an agency type (custom fields, active status)
export async function PATCH(request: NextRequest) {
  try {
    await requireAuthApi();

    const body = await request.json();
    const { id, customFields, isActive, label, color } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID du type requis' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (customFields !== undefined) updateData.customFields = customFields;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (label !== undefined) updateData.label = label;
    if (color !== undefined) updateData.color = color;

    const agencyType = await db.agencyType.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ agencyType });
  } catch (error) {
    console.error('Error updating agency type:', error);
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
