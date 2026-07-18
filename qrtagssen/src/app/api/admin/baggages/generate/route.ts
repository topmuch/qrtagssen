import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateSerialNumbersBulk, generateSetId, calculateExpirationDate, type AgencyType } from '@/lib/qr';
import { db } from '@/lib/db';

// Map legacy types to valid AgencyType values
const LEGACY_TYPE_MAP: Record<string, AgencyType> = {
  hajj: 'hotel',
  voyageur: 'luggage_storage',
};

// Schema for individual generation
const individualSchema = z.object({
  context: z.literal('individual'),
  type: z.enum(['hajj', 'voyageur']),
  firstName: z.string().min(2).max(50),
  lastName: z.string().min(2).max(50),
  whatsapp: z.string().min(6).max(20),
  duration: z.enum(['7d', '1y']),
  count: z.number().min(1).max(2),
});

// Schema for agency generation
const agencySchema = z.object({
  context: z.literal('agency'),
  type: z.enum(['hajj', 'voyageur']),
  agencyId: z.string().min(1),
  count: z.number().min(1).max(3),
  travelerCount: z.number().min(1).max(1000),
});

// Combined schema using discriminated union
const combinedSchema = z.discriminatedUnion('context', [
  individualSchema,
  agencySchema
]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = combinedSchema.parse(body);

    if (validatedData.context === 'individual') {
      const references = await generateBaggagesWithTraveler({
        type: validatedData.type,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        whatsapp: validatedData.whatsapp,
        duration: validatedData.duration,
        count: validatedData.count as 1 | 2,
      });

      return NextResponse.json({
        success: true,
        generated: references.length,
        references
      });
    } else {
      const result = await generateBaggagesBatch({
        type: validatedData.type,
        agencyId: validatedData.agencyId,
        travelerCount: validatedData.travelerCount,
        count: validatedData.type === 'hajj' ? 3 : validatedData.count as 1 | 3,
      });

      return NextResponse.json({
        success: true,
        generated: result.length,
        references: result
      });
    }
  } catch (error) {
    console.error('Generate QR error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * Generate tags for individual traveler with traveler info.
 * Maps 'hajj'/'voyageur' → valid AgencyType for serial number generation.
 */
async function generateBaggagesWithTraveler(options: {
  type: 'hajj' | 'voyageur';
  firstName: string;
  lastName: string;
  whatsapp: string;
  duration: '7d' | '1y';
  count: 1 | 2;
}): Promise<string[]> {
  const { type, firstName, lastName, whatsapp, duration, count } = options;

  // Map legacy type to valid AgencyType
  const agencyType = LEGACY_TYPE_MAP[type] || 'hotel';
  const setId = generateSetId(agencyType);
  const expiresAt = calculateExpirationDate(agencyType, duration === '1y' ? 'pro' : 'starter');

  // Generate all serial numbers in bulk
  const serialNumbers = await generateSerialNumbersBulk(agencyType, count);

  // Create tags with CORRECT Tag model field names
  await db.tag.createMany({
    data: serialNumbers.map((serialNumber, i) => ({
      serialNumber,
      tagType: 'standard',
      setId,
      agencyId: null,
      ownerName: `${firstName} ${lastName}`,
      ownerPhone: whatsapp,
      status: 'activated',
      activatedAt: new Date(),
      expiresAt,
      customData: JSON.stringify({
        legacyType: type,
        travelerFirstName: firstName,
        travelerLastName: lastName,
        duration,
        bagIndex: i + 1,
      }),
    })),
  });

  return serialNumbers;
}

/**
 * Generate tags for agency using BATCH INSERT.
 * Maps 'hajj'/'voyageur' → valid AgencyType for serial number generation.
 */
async function generateBaggagesBatch(options: {
  type: 'hajj' | 'voyageur';
  agencyId: string;
  travelerCount: number;
  count: 1 | 2 | 3;
}): Promise<string[]> {
  const { type, agencyId, travelerCount, count } = options;
  const total = travelerCount * count;

  console.log(`[GENERATE] Starting bulk generation: ${travelerCount} travelers × ${count} = ${total} QR codes`);

  // Map legacy type to valid AgencyType
  const agencyType = LEGACY_TYPE_MAP[type] || 'hotel';

  // Pre-generate all set IDs
  const setIds: string[] = [];
  for (let t = 0; t < travelerCount; t++) {
    setIds.push(generateSetId(agencyType));
  }

  // Generate ALL serial numbers in bulk
  const allSerialNumbers = await generateSerialNumbersBulk(agencyType, total);

  // Build all tag data with CORRECT Tag model field names
  const allData: Array<{
    serialNumber: string;
    tagType: string;
    setId: string;
    agencyId: string;
    status: string;
    customData: string;
  }> = [];

  let refIndex = 0;
  for (let t = 0; t < travelerCount; t++) {
    const setId = setIds[t];
    for (let i = 0; i < count; i++) {
      allData.push({
        serialNumber: allSerialNumbers[refIndex++],
        tagType: 'standard',
        setId,
        agencyId,
        status: 'created',
        customData: JSON.stringify({
          legacyType: type,
          travelerIndex: t + 1,
          bagIndex: i + 1,
        }),
      });
    }
  }

  // Batch insert in chunks of 200
  const BATCH_SIZE = 200;
  for (let i = 0; i < allData.length; i += BATCH_SIZE) {
    const batch = allData.slice(i, i + BATCH_SIZE);
    await db.tag.createMany({ data: batch });
    console.log(`[GENERATE] Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} tags (${Math.min(i + BATCH_SIZE, allData.length)}/${allData.length})`);
  }

  console.log(`[GENERATE] Complete: ${total} QR codes generated for ${travelerCount} travelers`);
  return allSerialNumbers;
}

// GET - Get all tags (for QR codes list)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agencyId = searchParams.get('agencyId');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '500');

    const where: Record<string, unknown> = {};

    if (agencyId) {
      where.agencyId = agencyId;
    }

    if (status) {
      where.status = status;
    }

    const tags = await db.tag.findMany({
      where,
      include: { agency: true },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return NextResponse.json({ baggages: tags });
  } catch (error) {
    console.error('Get baggages error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}