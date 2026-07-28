export type DashboardSummary = {
  patients: number;
  appointments: number;
  staff: number;
  products: number;
  tickets: number;
  revenue: number;
};

export type AppointmentStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'ATTENDED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'ABSENT'
  | 'CONSULTATION_REQUESTED';

export type Patient = {
  id: string;
  wallet: number;
  insurance?: string | null;
  address?: string | null;
  treatmentPlan?: string;
  nextAppointmentDate?: string | null;
  user: {
    fullName: string;
    phone: string;
  };
  appointments: Array<{
    id: string;
    service: string;
    date: string;
    time: string;
    status: AppointmentStatus;
    reviewed?: boolean;
    rating?: number | null;
  }>;
  medicalRecords?: MedicalRecord[];
};

export type MedicalRecord = {
  id: string;
  title: string;
  note: string;
  images: string[];
  createdAt: string;
  updatedAt: string;
  appointmentId?: string | null;
  createdByUser?: { fullName: string; role: string } | null;
};

export type Appointment = {
  id: string;
  service: string;
  date: string;
  time: string;
  status: AppointmentStatus;
  patient: {
    user: {
      fullName: string;
      phone: string;
    };
  };
  doctor?: {
    title: string;
    specialty?: string | null;
  } | null;
  handledBy?: { fullName: string; role: string } | null;
};

export type Product = {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  stock: number;
};

export type Doctor = {
  id: string;
  title: string;
  specialty?: string | null;
  service?: string | null;
  rating: number;
  imageUrl?: string | null;
  bio?: string | null;
  user: {
    fullName: string;
    phone: string;
  };
};

export type DoctorProfile = Doctor & {
  reviewCount: number;
  avgRating: number | null;
};

export type StaffDoctor = {
  id: string;
  title: string;
  specialty?: string | null;
  service?: string | null;
  shift: string;
  active: boolean;
  rating: number;
  imageUrl?: string | null;
  bio?: string | null;
  user: {
    fullName: string;
    phone: string;
  };
};

export type TopPatient = {
  id: string;
  fullName: string;
  phone: string;
  insurance?: string | null;
  visits: number;
};

export type FinanceReport = {
  revenue: number;
  payments: number;
  paidOrders: number;
  totalOrders: number;
  byMethod: Array<{ method: string; amount: number; count: number }>;
  recent: Array<{ id: string; amount: number; method: string; createdAt: string; patient: string }>;
};

export type DoctorReview = {
  id: string;
  service: string;
  rating: number | null;
  reviewText: string | null;
  updatedAt: string;
  patient: { user: { fullName: string } };
  doctor?: { user: { fullName: string }; specialty?: string | null; title: string } | null;
};

export type ServiceInvoice = {
  id: string;
  service: string;
  date: string;
  time: string;
  status: AppointmentStatus;
  patient: { user: { fullName: string; phone: string } };
  doctor?: { user: { fullName: string }; specialty?: string | null; title: string } | null;
  payments: Array<{ id: string; amount: number; method: string; status: string; reference?: string | null; createdAt: string }>;
};

export type OrderInvoice = {
  id: string;
  status: string;
  total: number;
  createdAt: string;
  patient: { user: { fullName: string; phone: string } };
  items: Array<{ id: string; qty: number; unitPrice: number; product: { name: string } }>;
  payments: Array<{ id: string; amount: number; method: string; status: string; reference?: string | null }>;
};

export type AuditEntry = {
  id: string;
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: string | null;
  createdAt: string;
};

export type Ticket = {
  id: string;
  subject: string;
  text: string;
  status: string;
  receiverRole: string;
  sender: {
    fullName: string;
    phone: string;
  };
};
