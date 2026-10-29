export interface ContactIdentity {
  contactJnid: string;
  phones: Array<string | null | undefined>;
  emails: Array<string | null | undefined>;
}

export interface ResolvedIdentity {
  phoneDigits: string[];
  emails: string[];
  ambiguousPhones: string[];
  ambiguousEmails: string[];
}

export function normalizePhoneDigits(
  phone: string | null | undefined
): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  return digits.length >= 7 ? digits : null;
}

export function normalizeEmail(
  email: string | null | undefined
): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized && normalized.includes("@") ? normalized : null;
}

function buildOwners(
  contacts: ContactIdentity[],
  select: (contact: ContactIdentity) => Array<string | null | undefined>,
  normalize: (value: string | null | undefined) => string | null
): Map<string, Set<string>> {
  const owners = new Map<string, Set<string>>();
  for (const contact of contacts) {
    for (const raw of select(contact)) {
      const value = normalize(raw);
      if (!value) continue;
      const current = owners.get(value) ?? new Set<string>();
      current.add(contact.contactJnid);
      owners.set(value, current);
    }
  }
  return owners;
}

export function resolveContactIdentity(
  contactJnid: string,
  contacts: ContactIdentity[]
): ResolvedIdentity {
  const target = contacts.find((contact) => contact.contactJnid === contactJnid);
  if (!target) {
    return {
      phoneDigits: [],
      emails: [],
      ambiguousPhones: [],
      ambiguousEmails: [],
    };
  }

  const phoneOwners = buildOwners(
    contacts,
    (contact) => contact.phones,
    normalizePhoneDigits
  );
  const emailOwners = buildOwners(
    contacts,
    (contact) => contact.emails,
    normalizeEmail
  );
  const targetPhones = [
    ...new Set(target.phones.map(normalizePhoneDigits).filter(Boolean)),
  ] as string[];
  const targetEmails = [
    ...new Set(target.emails.map(normalizeEmail).filter(Boolean)),
  ] as string[];

  return {
    phoneDigits: targetPhones.filter(
      (phone) => phoneOwners.get(phone)?.size === 1
    ),
    emails: targetEmails.filter((email) => emailOwners.get(email)?.size === 1),
    ambiguousPhones: targetPhones.filter(
      (phone) => (phoneOwners.get(phone)?.size ?? 0) > 1
    ),
    ambiguousEmails: targetEmails.filter(
      (email) => (emailOwners.get(email)?.size ?? 0) > 1
    ),
  };
}
