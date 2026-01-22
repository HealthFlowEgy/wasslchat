import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create Plans
  const plans = await Promise.all([
    prisma.plan.upsert({
      where: { slug: 'starter' },
      update: {},
      create: {
        name: 'Starter',
        nameAr: 'المبتدئ',
        slug: 'starter',
        description: 'Perfect for small businesses getting started',
        descriptionAr: 'مثالي للشركات الصغيرة في البداية',
        priceMonthly: 499,
        priceAnnual: 4990,
        conversationsLimit: 500,
        teamMembersLimit: 2,
        productsLimit: 100,
        chatbotFlowsLimit: 3,
        broadcastsLimit: 1000,
        storageLimit: 1024,
        whatsappApiType: 'BAILEYS',
        aiResponsesType: 'BASIC',
        supportLevel: 'EMAIL',
        features: { catalog: true, orders: true, payments: ['COD'], analytics: 'basic' },
        isActive: true,
        sortOrder: 1,
      },
    }),
    prisma.plan.upsert({
      where: { slug: 'growth' },
      update: {},
      create: {
        name: 'Growth',
        nameAr: 'النمو',
        slug: 'growth',
        description: 'For growing businesses with more needs',
        descriptionAr: 'للشركات النامية ذات الاحتياجات المتزايدة',
        priceMonthly: 1499,
        priceAnnual: 14990,
        conversationsLimit: 2000,
        teamMembersLimit: 5,
        productsLimit: 500,
        chatbotFlowsLimit: 10,
        broadcastsLimit: 5000,
        storageLimit: 5120,
        whatsappApiType: 'BAILEYS',
        aiResponsesType: 'ADVANCED',
        supportLevel: 'CHAT',
        features: { catalog: true, orders: true, payments: ['COD', 'FAWRY', 'VODAFONE_CASH'], analytics: 'advanced', automation: true },
        isActive: true,
        isPopular: true,
        sortOrder: 2,
      },
    }),
    prisma.plan.upsert({
      where: { slug: 'business' },
      update: {},
      create: {
        name: 'Business',
        nameAr: 'الأعمال',
        slug: 'business',
        description: 'For established businesses with high volume',
        descriptionAr: 'للشركات الراسخة ذات الحجم الكبير',
        priceMonthly: 3999,
        priceAnnual: 39990,
        conversationsLimit: 10000,
        teamMembersLimit: 15,
        productsLimit: -1,
        chatbotFlowsLimit: -1,
        broadcastsLimit: 25000,
        storageLimit: 20480,
        whatsappApiType: 'CLOUD_API',
        aiResponsesType: 'GPT4',
        supportLevel: 'PRIORITY',
        features: { catalog: true, orders: true, payments: ['COD', 'FAWRY', 'VODAFONE_CASH', 'INSTAPAY', 'HEALTHPAY', 'CARD'], analytics: 'full', automation: true, api: true },
        isActive: true,
        sortOrder: 3,
      },
    }),
  ]);

  console.log(`✅ Created ${plans.length} plans`);

  // Create Demo Tenant
  const demoTenant = await prisma.tenant.upsert({
    where: { slug: 'demo-store' },
    update: {},
    create: {
      name: 'Demo Store',
      nameAr: 'المتجر التجريبي',
      slug: 'demo-store',
      subdomain: 'demo',
      email: 'demo@wasslchat.com',
      phone: '+201234567890',
      planId: plans[1].id,
      status: 'ACTIVE',
      timezone: 'Africa/Cairo',
      locale: 'ar-EG',
      currency: 'EGP',
      countryCode: 'EG',
    },
  });

  console.log(`✅ Created demo tenant: ${demoTenant.name}`);

  // Create Demo User
  const passwordHash = await bcrypt.hash('Demo@123', 12);
  const demoUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: demoTenant.id, email: 'admin@demo.wasslchat.com' } },
    update: {},
    create: {
      tenantId: demoTenant.id,
      email: 'admin@demo.wasslchat.com',
      passwordHash,
      firstName: 'Ahmed',
      lastName: 'Mohamed',
      firstNameAr: 'أحمد',
      lastNameAr: 'محمد',
      phone: '+201234567890',
      role: 'OWNER',
      isActive: true,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  console.log(`✅ Created demo user: ${demoUser.email}`);

  // Create Demo Categories
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { tenantId_slug: { tenantId: demoTenant.id, slug: 'electronics' } },
      update: {},
      create: { tenantId: demoTenant.id, name: 'Electronics', nameAr: 'الإلكترونيات', slug: 'electronics', isActive: true, sortOrder: 1 },
    }),
    prisma.category.upsert({
      where: { tenantId_slug: { tenantId: demoTenant.id, slug: 'fashion' } },
      update: {},
      create: { tenantId: demoTenant.id, name: 'Fashion', nameAr: 'الأزياء', slug: 'fashion', isActive: true, sortOrder: 2 },
    }),
  ]);

  console.log(`✅ Created ${categories.length} categories`);

  // Create Demo Products
  const products = await Promise.all([
    prisma.product.upsert({
      where: { tenantId_slug: { tenantId: demoTenant.id, slug: 'iphone-15-pro' } },
      update: {},
      create: {
        tenantId: demoTenant.id,
        categoryId: categories[0].id,
        sku: 'IP15PRO-256',
        name: 'iPhone 15 Pro',
        nameAr: 'آيفون 15 برو',
        slug: 'iphone-15-pro',
        price: 54999,
        compareAtPrice: 59999,
        inventoryQty: 50,
        images: ['https://placehold.co/600x600/png?text=iPhone+15+Pro'],
        isActive: true,
        isFeatured: true,
        tags: ['apple', 'iphone', 'smartphone'],
      },
    }),
    prisma.product.upsert({
      where: { tenantId_slug: { tenantId: demoTenant.id, slug: 'casual-tshirt' } },
      update: {},
      create: {
        tenantId: demoTenant.id,
        categoryId: categories[1].id,
        sku: 'TS-BLK-L',
        name: 'Casual Cotton T-Shirt',
        nameAr: 'تي شيرت قطن كاجوال',
        slug: 'casual-tshirt',
        price: 299,
        inventoryQty: 200,
        images: ['https://placehold.co/600x600/png?text=T-Shirt'],
        isActive: true,
        tags: ['clothing', 'tshirt', 'cotton'],
      },
    }),
  ]);

  console.log(`✅ Created ${products.length} products`);
  console.log('\n✨ Database seeded successfully!');
  console.log('\n📝 Demo Credentials:');
  console.log('   Email: admin@demo.wasslchat.com');
  console.log('   Password: Demo@123');
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
