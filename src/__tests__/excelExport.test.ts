import { describe, expect, it } from 'vitest';
import {
  buildAttendanceWorkbook,
  sanitizeSheetName,
  type ExportClassBundle,
} from '../lib/excel/exportAttendance';
import type { Student } from '../types';

function makeStudent(sid: string, name: string): Student {
  return {
    schoolStudentId: sid,
    name,
    deviceUid: 'u1',
    publicKeyJwk: { kty: 'EC', crv: 'P-256' },
    keyFingerprint: 'ABCD2345',
    selfiePath: `selfies/${sid}/ABCD2345.webp`,
    selfieHash: '',
    registrationTimestamp: 1,
    rotatedKeys: [],
  };
}

describe('Offline ExcelJS Export (§10)', () => {
  it('generates multi-class workbook with ✓, A, —, Presence %, and Summary sheet', async () => {
    const alice = makeStudent('S1', 'Alice');
    const bob = makeStudent('S2', 'Bob');
    const carol = makeStudent('S3', 'Carol');

    const bundles: ExportClassBundle[] = [
      {
        classDoc: {
          classId: 'c1',
          name: 'Biology 12 – Group A: Very Long Class Name That Exceeds 31 Chars',
          teacherUid: 't1',
          studentIds: ['S1', 'S2'],
          createdAt: 1,
        },
        students: [alice, bob],
        attendance: [
          {
            attendanceId: 'a1',
            classId: 'c1',
            sessionDate: '2026-11-10',
            schoolStudentId: 'S1',
            teacherUid: 't1',
            scannedAt: 100,
            studentTs: 100,
            studentKeyFingerprint: 'ABCD2345',
            signatureValid: true,
          },
        ],
      },
      {
        classDoc: {
          classId: 'c2',
          name: 'Chemistry Lab',
          teacherUid: 't1',
          studentIds: ['S3'],
          createdAt: 2,
        },
        students: [carol],
        attendance: [
          {
            attendanceId: 'a2',
            classId: 'c2',
            sessionDate: '2026-11-11',
            schoolStudentId: 'S3',
            teacherUid: 't1',
            scannedAt: 200,
            studentTs: 200,
            studentKeyFingerprint: 'ABCD2345',
            signatureValid: true,
          },
        ],
      },
    ];

    const wb = await buildAttendanceWorkbook({
      bundles,
      fromDate: null,
      toDate: null,
      includeSummary: true,
    });

    expect(wb.worksheets).toHaveLength(3); // 2 class sheets + Summary
    const bioSheet = wb.worksheets[0];
    const chemSheet = wb.worksheets[1];
    const summarySheet = wb.worksheets[2];

    expect(bioSheet.name.length).toBeLessThanOrEqual(31);
    expect(bioSheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });

    // Bio headers: Student ID | Name | 2026-11-10 | 2026-11-11 | Presence %
    expect(bioSheet.getRow(1).values).toEqual([
      undefined,
      'Student ID',
      'Name',
      '2026-11-10',
      '2026-11-11',
      'Presence %',
    ]);

    // Alice: present on 11-10, no session on 11-11 ('—'), 100% presence
    expect(bioSheet.getRow(2).values).toEqual([
      undefined,
      'S1',
      'Alice',
      '✓',
      '—',
      1,
    ]);
    // Bob: absent on 11-10 ('A'), no session on 11-11 ('—'), 0% presence
    expect(bioSheet.getRow(3).values).toEqual([
      undefined,
      'S2',
      'Bob',
      'A',
      '—',
      0,
    ]);
    expect(bioSheet.getRow(2).getCell(5).numFmt).toBe('0.0%');

    // Chem: Carol no session on 11-10 ('—'), present on 11-11 ('✓')
    expect(chemSheet.getRow(2).values).toEqual([
      undefined,
      'S3',
      'Carol',
      '—',
      '✓',
      1,
    ]);

    expect(summarySheet.name).toBe('Summary');
    expect(summarySheet.rowCount).toBe(4); // header + 3 student rows
  });

  it('disambiguates colliding truncated sheet names within 31 chars', () => {
    const used = new Set<string>();
    const s1 = sanitizeSheetName('A'.repeat(35), used);
    const s2 = sanitizeSheetName('A'.repeat(35), used);
    expect(s1.length).toBeLessThanOrEqual(31);
    expect(s2.length).toBeLessThanOrEqual(31);
    expect(s1).not.toBe(s2);
  });
});
