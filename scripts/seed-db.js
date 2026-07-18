const { PrismaClient } = require('/home/z/my-project/qrtagssen/node_modules/@prisma/client');
const bcrypt = require('/home/z/my-project/qrtagssen/node_modules/bcryptjs');
process.env.DATABASE_URL = 'file:/home/z/my-project/db/custom.db';
const p = new PrismaClient();
(async () => {
  try {
    for (const t of [
      { name: 'hotel', label: 'Hôtel', icon: 'Hotel', color: '#2563EB', description: 'Hôtels et hébergements' },
      { name: 'bus', label: 'Compagnie de Bus', icon: 'Bus', color: '#7C3AED', description: 'Transport par bus' },
      { name: 'school', label: 'École / Université', icon: 'GraduationCap', color: '#059669', description: 'Établissements scolaires' },
      { name: 'clinic', label: 'Clinique / Hôpital', icon: 'Stethoscope', color: '#DC2626', description: 'Établissements de santé' },
      { name: 'car_rental', label: 'Loueur de Voitures', icon: 'Car', color: '#D97706', description: 'Location de véhicules' },
      { name: 'luggage_storage', label: 'Consigne de Bagages', icon: 'Luggage', color: '#0891B2', description: 'Consignes et stockage' },
      { name: 'enterprise', label: 'Entreprise', icon: 'Building2', color: '#4F46E5', description: 'Entreprises et sociétés' },
      { name: 'event', label: 'Événementiel', icon: 'PartyPopper', color: '#E11D48', description: 'Organisation événementielle' },
    ]) {
      try { await p.agencyType.upsert({ where: { name: t.name }, update: {}, create: { id: 'at_'+t.name, ...t, customFields: '[]', isActive: true, sortOrder: 0 } }); } catch(e) {}
    }
    const hp = await bcrypt.hash('admin123', 12);
    try {
      const ex = await p.user.findUnique({ where: { email: 'admin@qrtags.com' } });
      if (ex) await p.user.update({ where: { id: ex.id }, data: { password: hp, role: 'superadmin', isActive: true } });
      else await p.user.create({ data: { email: 'admin@qrtags.com', name: 'Super Admin', password: hp, role: 'superadmin', isActive: true, permissions: '[]' } });
    } catch(e) {}
    console.log('OK:', (await p.agencyType.findMany()).length, 'types,', (await p.user.findMany()).length, 'users');
  } catch(e) { console.error(e); }
  finally { await p.$disconnect(); }
})();