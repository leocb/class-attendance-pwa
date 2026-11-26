/**
 * Student records are scoped to the teacher who first scanned them, so school
 * IDs may repeat across teachers (e.g. different schools) but stay unique
 * within a teacher's roster. The document id is `${teacherUid}__${sid}`.
 */
export function studentDocId(
  teacherUid: string,
  schoolStudentId: string
): string {
  return `${teacherUid}__${schoolStudentId}`;
}
