import { AppointmentStatus, PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.fileAsset.deleteMany();
  await prisma.medicalRecord.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.staffProfile.deleteMany();
  await prisma.user.deleteMany();

  const admin = await prisma.user.create({
    data: {
      role: Role.ADMIN,
      phone: '09120000000',
      fullName: 'مدیر کلینیک شاد',
      passwordHash: await bcrypt.hash('1030', 10),
      staffProfile: {
        create: {
          title: 'مدیریت',
          service: 'general',
          shift: 'morning',
          active: true,
          rating: 5,
          gallery: []
        }
      }
    },
    include: { staffProfile: true }
  });

  const doctor = await prisma.user.create({
    data: {
      role: Role.DOCTOR,
      phone: '09123334444',
      fullName: 'دکتر نرگس صادقی',
      passwordHash: await bcrypt.hash('1030', 10),
      staffProfile: {
        create: {
          title: 'پزشک',
          specialty: 'ارتودنسی',
          service: 'ارتودنسی',
          shift: 'evening',
          active: true,
          rating: 5,
          gallery: []
        }
      }
    },
    include: { staffProfile: true }
  });

  // (#7) Five named reception accounts, each with its own phone/password —
  // every appointment/record they touch is attributed to their own profile
  // via AuditLog.actorId, not a shared generic "پذیرش" login.
  const receptionSeeds = [
    { phone: '09121110001', fullName: 'زهرا احمدی' },
    { phone: '09121110002', fullName: 'مریم رضایی' },
    { phone: '09121110003', fullName: 'سارا محمدی' },
    { phone: '09121110004', fullName: 'نگین کریمی' },
    { phone: '09121110005', fullName: 'الهام حسینی' }
  ];
  for (const r of receptionSeeds) {
    await prisma.user.create({
      data: {
        role: Role.RECEPTION,
        phone: r.phone,
        fullName: r.fullName,
        passwordHash: await bcrypt.hash('1030', 10),
        staffProfile: {
          create: { title: 'پذیرش', service: 'general', shift: 'morning', active: true, rating: 5, gallery: [] }
        }
      }
    });
  }

  const patientUser = await prisma.user.create({
    data: {
      role: Role.PATIENT,
      phone: '09122223333',
      fullName: 'عرفان کرطلائی',
      passwordHash: await bcrypt.hash('1030', 10),
      patient: {
        create: {
          nationalId: '1741234567',
          insurance: 'تامین اجتماعی',
          address: 'اهواز، کیانپارس',
          wallet: 2500000,
          treatmentPlan: 'درمان اولیه و کنترل دوره‌ای',
          treatmentPlanImages: [],
          isPlanActive: true
        }
      }
    },
    include: { patient: true }
  });

  const patient = patientUser.patient!;

  const appointment = await prisma.appointment.create({
    data: {
      patientId: patient.id,
      doctorId: doctor.staffProfile?.id,
      service: 'ارتودنسی',
      date: 'شنبه ۱۲ ماه',
      time: '16:45',
      status: AppointmentStatus.APPROVED
    }
  });

  await prisma.medicalRecord.create({
    data: {
      patientId: patient.id,
      appointmentId: appointment.id,
      title: 'جلسه اول',
      note: 'بررسی اولیه و ثبت طرح درمان.',
      images: [],
      createdByUserId: admin.id
    }
  });

  await prisma.product.createMany({
    data: [
      {
        sku: 'P-001',
        name: 'خمیر دندان سفیدکننده تخصصی',
        category: 'بهداشت دهان',
        description: 'حاوی فلوراید و مواد ضد حساسیت',
        price: 350000,
        stock: 25
      },
      {
        sku: 'P-002',
        name: 'دهان‌شویه ضدباکتری',
        category: 'بهداشت دهان',
        description: 'محافظت 12 ساعته در برابر پلاک',
        price: 220000,
        stock: 40
      },
      {
        sku: 'P-003',
        name: 'مسواک برقی هوشمند',
        category: 'تجهیزات',
        description: 'دارای سنسور فشار و 3 حالت شستشو',
        price: 2950000,
        stock: 8
      }
    ]
  });

  await prisma.ticket.create({
    data: {
      senderUserId: patientUser.id,
      receiverRole: Role.ADMIN,
      subject: 'سوال درباره نوبت',
      text: 'لطفاً وضعیت نوبت من را بررسی کنید.'
    }
  });
}

main().finally(async () => {
  await prisma.$disconnect();
});
