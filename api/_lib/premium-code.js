const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion

export function generatePremiumCode() {
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return `SNAP-${suffix}`;
}
