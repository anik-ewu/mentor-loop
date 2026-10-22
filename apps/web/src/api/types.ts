export type Role = 'user' | 'admin';
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  isActive: boolean;
}

export interface Slot {
  id: string;
  startsAt: string;
  endsAt: string;
  status: 'open' | 'booked';
}

export interface Booking {
  id: string;
  status: BookingStatus;
  note: string | null;
  cvUrl: string | null;
  createdAt: string;
  slot: Slot;
  service: Pick<Service, 'id' | 'name' | 'durationMin'>;
  user: Pick<User, 'id' | 'name' | 'email' | 'avatarUrl'>;
}

export interface AdminSlot extends Slot {
  bookings: (Booking & { service: Service })[];
}

export interface Stats {
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  users: number;
  openSlots: number;
  nextBooking: Booking | null;
}

export interface AuthConfig {
  googleClientId: string | null;
  demoMode: boolean;
}
