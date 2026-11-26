/**
 * Canonical comparison for student names. The QR name is typed by the student
 * (including after key recovery), so compare case-insensitively and ignore
 * extra whitespace while still rejecting a genuinely different name.
 */
export function normalizeStudentName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function studentNamesMatch(a: string, b: string): boolean {
  return normalizeStudentName(a) === normalizeStudentName(b);
}
