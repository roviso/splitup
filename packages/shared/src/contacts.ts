export type Contact = { name: string; email?: string; phone?: string };

/** Minimal RFC-4180 CSV: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [[]];
  let cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { rows.at(-1)!.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      rows.at(-1)!.push(cur); cur = ''; rows.push([]);
    } else cur += c;
  }
  rows.at(-1)!.push(cur);
  return rows.filter((r) => r.some((x) => x.trim()));
}

const clean = (c: Contact): Contact | null => {
  const name = c.name.trim() || c.email?.split('@')[0] || c.phone || '';
  const email = c.email?.trim().toLowerCase() || undefined;
  const phone = c.phone?.replace(/[^\d+]/g, '') || undefined;
  return name && (email || phone) ? { name: name.slice(0, 60), email, phone } : null;
};

/** Contacts from a .vcf (phone export) or .csv (Google/Outlook export). Keeps entries with an email or phone. */
export function parseContacts(text: string): Contact[] {
  let out: (Contact | null)[];
  if (/BEGIN:VCARD/i.test(text)) {
    const unfolded = text.replace(/\r?\n[ \t]/g, '');
    out = unfolded.split(/BEGIN:VCARD/i).slice(1).map((card) => {
      const get = (key: string) => card.match(new RegExp(`^(?:item\\d+\\.)?${key}[^:\\n]*:(.*)$`, 'im'))?.[1]?.trim();
      const n = get('N')?.split(';');
      return clean({ name: get('FN') ?? [n?.[1], n?.[0]].filter(Boolean).join(' '), email: get('EMAIL'), phone: get('TEL') });
    });
  } else {
    const [head, ...rows] = parseCsv(text);
    if (!head) return [];
    const find = (re: RegExp) => head.findIndex((h) => re.test(h.trim()));
    const name = find(/^(display )?name$/i), first = find(/^first ?name$/i), last = find(/^last ?name$/i);
    const email = find(/e-?mail/i), phone = find(/phone|mobile|tel/i);
    out = rows.map((r) => clean({
      name: name >= 0 ? r[name] : [r[first], r[last]].filter(Boolean).join(' '),
      email: email >= 0 ? r[email] : undefined,
      phone: phone >= 0 ? r[phone]?.split(':::')[0] : undefined,
    }));
  }
  const seen = new Set<string>();
  return out.filter((c): c is Contact => !!c && !seen.has(c.email ?? c.phone!) && !!seen.add(c.email ?? c.phone!));
}
