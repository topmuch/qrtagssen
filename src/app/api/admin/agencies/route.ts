import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';
import { sendEmail, getEmailSettings, getNewAgencyEmailTemplate } from '@/lib/email';

// Validation schema - includes agencyTypeId (required by Prisma)
const agencySchema = z.object({
  name: z.string().min(1, 'Le nom est requis'),
  slug: z.string().min(1, 'Le slug est requis'),
  agencyTypeId: z.string().min(1, "Le type d'agence est requis"),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
});

// GET - List all agencies
export async function GET() {
  try {
    const agencies = await db.agency.findMany({
      include: {
        agencyType: {
          select: { id: true, name: true, label: true, icon: true, color: true }
        },
        _count: {
          select: { tags: true, users: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ agencies });

  } catch (error) {
    console.error('Get agencies error:', error);
    return NextResponse.json(
      { error: 'Internal server error', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// POST - Create new agency
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = agencySchema.parse(body);

    // Check if slug already exists
    const existing = await db.agency.findUnique({
      where: { slug: validatedData.slug }
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Ce slug est déjà utilisé' },
        { status: 400 }
      );
    }

    // Verify the agency type exists
    const agencyType = await db.agencyType.findUnique({
      where: { id: validatedData.agencyTypeId }
    });

    if (!agencyType) {
      return NextResponse.json(
        { error: "Type d'agence non trouvé. Veuillez d'abord créer un type d'agence." },
        { status: 400 }
      );
    }

    const agency = await db.agency.create({
      data: {
        name: validatedData.name,
        slug: validatedData.slug,
        agencyTypeId: validatedData.agencyTypeId,
        email: validatedData.email || null,
        phone: validatedData.phone || null,
        address: validatedData.address || null,
        city: validatedData.city || null,
        country: validatedData.country || null,
      }
    });

    // 📧 Send email notification to superadmin
    try {
      const emailSettings = await getEmailSettings();
      if (emailSettings) {
        const recipientEmail = emailSettings.recipientEmail || emailSettings.fromEmail;
        if (recipientEmail) {
          const template = getNewAgencyEmailTemplate({
            name: agency.name,
            email: agency.email || undefined,
            phone: agency.phone || undefined,
            address: agency.address || undefined,
          });

          await sendEmail({
            to: recipientEmail,
            subject: `🏢 Nouvelle agence créée — ${agency.name}`,
            html: template.html,
            text: template.text,
            type: 'new_agency',
          });
          console.log(`📧 New agency notification sent for ${agency.name} to ${recipientEmail}`);
        }
      }
    } catch (emailError) {
      console.error('Failed to send new agency email:', emailError);
    }

    // 🔔 Create in-app notification for SuperAdmin
    try {
      await db.notification.create({
        data: {
          type: 'new_agency',
          message: `🏢 Nouvelle agence créée : ${agency.name}${agency.email ? ` (${agency.email})` : ''}`,
          read: false,
        }
      });
    } catch (notifError) {
      console.error('Failed to create notification:', notifError);
    }

    return NextResponse.json({ agency });

  } catch (error) {
    console.error('Create agency error:', error);
    
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

// PUT - Update agency
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, active, ...data } = body;

    if (!id) {
      return NextResponse.json(
        { error: "L'ID de l'agence est requis" },
        { status: 400 }
      );
    }

    // Validate only the fields that are present
    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.email !== undefined) updateData.email = data.email || null;
    if (data.phone !== undefined) updateData.phone = data.phone || null;
    if (data.address !== undefined) updateData.address = data.address || null;
    if (data.city !== undefined) updateData.city = data.city || null;
    if (data.country !== undefined) updateData.country = data.country || null;
    if (data.agencyTypeId !== undefined) updateData.agencyTypeId = data.agencyTypeId;
    if (active !== undefined) updateData.active = active;

    // Check slug uniqueness if slug is being updated
    if (data.slug) {
      const existingWithSlug = await db.agency.findFirst({
        where: { slug: data.slug, NOT: { id } }
      });
      if (existingWithSlug) {
        return NextResponse.json(
          { error: 'Ce slug est déjà utilisé par une autre agence' },
          { status: 400 }
        );
      }
    }

    const agency = await db.agency.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ agency });

  } catch (error) {
    console.error('Update agency error:', error);
    return NextResponse.json(
      { error: 'Internal server error', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// DELETE - Delete agency
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: "L'ID de l'agence est requis" },
        { status: 400 }
      );
    }

    await db.agency.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Delete agency error:', error);
    return NextResponse.json(
      { error: 'Internal server error', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
