// ========== prisma/seed.js ==========
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create Admin role with all permissions
  const adminRole = await prisma.role.upsert({
    where: { name: 'Admin' },
    update: {
      permissions: [
        'inventory.view', 'inventory.create', 'inventory.edit', 'inventory.delete',
        'finance.view', 'finance.create', 'finance.edit', 'finance.delete',
        'reports.view', 'reports.export',
        'users.view', 'users.create', 'users.edit', 'users.delete',
        'roles.view', 'roles.create', 'roles.edit', 'roles.delete',
        'settings.view', 'settings.edit'
      ]
    },
    create: {
      name: 'Admin',
      description: 'Administrator with full system access',
      permissions: [
        'inventory.view', 'inventory.create', 'inventory.edit', 'inventory.delete',
        'finance.view', 'finance.create', 'finance.edit', 'finance.delete',
        'reports.view', 'reports.export',
        'users.view', 'users.create', 'users.edit', 'users.delete',
        'roles.view', 'roles.create', 'roles.edit', 'roles.delete',
        'settings.view', 'settings.edit'
      ]
    }
  });

  // Create admin user
  const hashedPassword = await bcrypt.hash('admin123', 10);

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { roleId: adminRole.id },
    create: {
      username: 'admin',
      password: hashedPassword,
      fullName: 'System Administrator',
      email: 'admin@company.com',
      roleId: adminRole.id
    }
  });

  console.log('\n========================================');
  console.log('✅ SEEDING COMPLETED SUCCESSFULLY!');
  console.log('========================================');
  console.log('\n📊 Summary:');
  console.log('   - 1 Role (Admin)');
  console.log('   - 1 User (admin)');
  console.log('\n🔐 Login Credentials:');
  console.log('   Username: admin');
  console.log('   Password: admin123');
  console.log('   Role: Admin (Full System Access)');
  console.log('========================================\n');
}



main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });