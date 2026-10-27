export function confirmedBookingWhatsApp(input: { phone: string; name: string; startsAt: string;
  timezone: string; businessName: string }): string | null {
  const phone = input.phone.replace(/[^0-9]/g, "");
  if (!/^[1-9][0-9]{6,14}$/.test(phone) || !Number.isFinite(Date.parse(input.startsAt))) return null;
  const date = new Intl.DateTimeFormat("de-DE", { timeZone: input.timezone, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(input.startsAt));
  const time = new Intl.DateTimeFormat("de-DE", { timeZone: input.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(input.startsAt));
  const message = `Hallo ${input.name}, dein Termin am ${date} um ${time} Uhr ist bestätigt. Bis bald – ${input.businessName}.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function proposedBookingWhatsApp(input: { phone: string; name: string; startsAt: string;
  timezone: string; businessName: string }): string | null {
  const phone = input.phone.replace(/[^0-9]/g, "");
  if (!/^[1-9][0-9]{6,14}$/.test(phone) || !Number.isFinite(Date.parse(input.startsAt))) return null;
  const date = new Intl.DateTimeFormat("de-DE", { timeZone: input.timezone, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(input.startsAt));
  const time = new Intl.DateTimeFormat("de-DE", { timeZone: input.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(input.startsAt));
  return `https://wa.me/${phone}?text=${encodeURIComponent(`Hallo ${input.name}, passt dir stattdessen ein Termin am ${date} um ${time} Uhr? Bitte gib uns Bescheid. – ${input.businessName}.`)}`;
}
