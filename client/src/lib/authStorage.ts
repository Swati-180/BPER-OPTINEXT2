export type PortalRole = 'employee' | 'manager' | 'admin';

export type AuthSource = 'normal' | 'invite' | 'demo';

export interface AppAuthUser {
  _id?: string;
  id?: string;
  name: string;
  email: string;
  role: string;
  organization?: string;
  employeeId?: string;
  designation?: string;
  band?: string;
  location?: string;
  maxMonthlyHours?: number;
  source: AuthSource;
  inviteToken?: string;
}

export interface InviteRecord {
  token: string;
  email: string;
  invitedBy: string;
  createdAt: string;
  role: 'employee';
  status: 'pending' | 'accepted';
  acceptedAt?: string;
}

const AUTH_USER_KEY = 'bper.auth.user';
const INVITES_KEY = 'bper.invites';

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function createToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

export function loadAuthUser(): AppAuthUser | null {
  return readJson<AppAuthUser | null>(AUTH_USER_KEY, null);
}

export function saveAuthUser(user: AppAuthUser) {
  writeJson(AUTH_USER_KEY, user);
}

export function clearAuthUser() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(AUTH_USER_KEY);
  window.dispatchEvent(new CustomEvent('bper:auth-cleared'));
}

export function loadInvites(): InviteRecord[] {
  return readJson<InviteRecord[]>(INVITES_KEY, []);
}

export function saveInvites(invites: InviteRecord[]) {
  writeJson(INVITES_KEY, invites);
}

export function createInvite(email: string, invitedBy = 'QG User2') {
  const normalizedEmail = email.trim().toLowerCase();
  const token = createToken();
  const invite: InviteRecord = {
    token,
    email: normalizedEmail,
    invitedBy,
    createdAt: new Date().toISOString(),
    role: 'employee',
    status: 'pending',
  };

  const next = [invite, ...loadInvites().filter((item) => item.email !== normalizedEmail)];
  saveInvites(next);

  return invite;
}

export function findInviteByToken(token: string) {
  return loadInvites().find((item) => item.token === token) ?? null;
}

export function findInviteByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return loadInvites().find((item) => item.email === normalizedEmail) ?? null;
}

export function acceptInvite(token: string) {
  const invites = loadInvites();
  let accepted: InviteRecord | null = null;

  const next = invites.map((item) => {
    if (item.token !== token) return item;

    accepted = {
      ...item,
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
    };

    return accepted;
  });

  if (accepted) {
    saveInvites(next);
  }

  return accepted;
}

export function getInviteSignupLink(organization = 'QGGlobal') {
  const encodedOrg = encodeURIComponent(organization);
  if (typeof window === 'undefined') return `/auth/signup?org=${encodedOrg}&role=employee`;
  return `${window.location.origin}/auth/signup?org=${encodedOrg}&role=employee`;
}
