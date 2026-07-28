const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000/api';

/** Origin of the API (without the /api prefix) — used to resolve uploaded media URLs. */
export const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '');
/** Resolve a stored media path (e.g. /uploads/x.jpg) to a full URL. */
export const mediaUrl = (path: string) => (/^https?:\/\//.test(path) ? path : `${API_ORIGIN}${path}`);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('shad_token');
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'API request failed');
  }

  return res.json() as Promise<T>;
}

export const api = {
  authPatientLogin: (body: Record<string, unknown>) =>
    request('/auth/patient/login', { method: 'POST', body: JSON.stringify(body) }),
  authPatientRegister: (body: Record<string, unknown>) =>
    request('/auth/patient/register', { method: 'POST', body: JSON.stringify(body) }),
  authStaffLogin: (body: Record<string, unknown>) =>
    request('/auth/staff/login', { method: 'POST', body: JSON.stringify(body) }),
  requestOtp: (body: Record<string, unknown>) =>
    request('/auth/patient/otp/request', { method: 'POST', body: JSON.stringify(body) }),
  verifyOtp: (body: Record<string, unknown>) =>
    request('/auth/patient/otp/verify', { method: 'POST', body: JSON.stringify(body) }),
  dashboard: () => request('/dashboard/summary'),
  patients: () => request('/patients'),
  appointments: () => request('/appointments'),
  doctors: () => request('/doctors'),
  staffDoctors: () => request('/staff/doctors'),
  updateDoctor: (id: string, body: Record<string, unknown>) =>
    request(`/staff/doctors/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  topPatients: () => request('/top-patients'),
  financeReport: () => request('/finance/report'),
  audit: () => request('/audit'),
  products: () => request('/products'),
  tickets: () => request('/tickets'),
  patient: (id: string) => request(`/patients/${id}`),
  createPatient: (body: Record<string, unknown>) =>
    request('/patients', { method: 'POST', body: JSON.stringify(body) }),
  updatePatient: (id: string, body: Record<string, unknown>) =>
    request(`/patients/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  createRecord: (body: Record<string, unknown>) =>
    request('/records', { method: 'POST', body: JSON.stringify(body) }),
  uploadFile: async (file: File): Promise<{ url: string }> => {
    const token = localStorage.getItem('shad_token');
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE}/uploads`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: form
    });
    if (!res.ok) throw new Error((await res.text()) || 'آپلود فایل ناموفق بود');
    return res.json() as Promise<{ url: string }>;
  },
  createAppointment: (body: Record<string, unknown>) =>
    request('/appointments', { method: 'POST', body: JSON.stringify(body) }),
  updateAppointmentStatus: (id: string, body: Record<string, unknown>) =>
    request(`/appointments/${id}/status`, { method: 'PATCH', body: JSON.stringify(body) }),
  createTicket: (body: Record<string, unknown>) =>
    request('/tickets', { method: 'POST', body: JSON.stringify(body) }),
  createOrder: (body: Record<string, unknown>) =>
    request('/orders', { method: 'POST', body: JSON.stringify(body) }),
  requestPayment: (body: Record<string, unknown>) =>
    request('/payments/request', { method: 'POST', body: JSON.stringify(body) }),
  verifyPayment: (body: Record<string, unknown>) =>
    request('/payments/verify', { method: 'POST', body: JSON.stringify(body) }),
  invoice: (id: string) => request(`/orders/${id}/invoice`),
  changePassword: (body: Record<string, unknown>) =>
    request('/auth/change-password', { method: 'POST', body: JSON.stringify(body) }),
  staffUsers: () => request('/staff/users'),
  adminResetPassword: (body: Record<string, unknown>) =>
    request('/auth/admin/reset-password', { method: 'POST', body: JSON.stringify(body) }),
  submitReview: (id: string, body: Record<string, unknown>) =>
    request(`/appointments/${id}/review`, { method: 'PATCH', body: JSON.stringify(body) }),
  reviews: (doctorId?: string) => request(`/reviews${doctorId ? `?doctorId=${doctorId}` : ''}`),
  payForService: (id: string, body: Record<string, unknown>) =>
    request(`/appointments/${id}/pay`, { method: 'POST', body: JSON.stringify(body) }),
  serviceInvoice: (id: string) => request(`/appointments/${id}/invoice`),
  serviceHistory: (from: string, to: string) => request(`/service-history?from=${from}&to=${to}`),
  doctorProfile: (id: string) => request(`/doctors/${id}/profile`)
};
