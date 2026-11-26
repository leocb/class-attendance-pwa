import ExcelJS from 'exceljs';
import type { Attendance, ClassDoc, Student } from '../../types';

export interface ExportClassBundle {
  classDoc: ClassDoc;
  students: Student[];
  attendance: Attendance[];
}

export interface ExportLabels {
  studentId?: string;
  name?: string;
  presencePct?: string;
  summarySheet?: string;
  classCol?: string;
  scannedCol?: string;
  totalSessionsCol?: string;
}

export interface ExportOptions {
  bundles: ExportClassBundle[];
  fromDate: string | null;
  toDate: string | null;
  includeSummary: boolean;
  labels?: ExportLabels;
}

export function sanitizeSheetName(raw: string, usedNames: Set<string>): string {
  const cleaned = raw.replace(/[:\\/?*[\]]/g, '_').trim() || 'Class';
  let candidate = cleaned.slice(0, 31);
  let suffix = 1;
  while (usedNames.has(candidate)) {
    const tag = ` (${suffix++})`;
    candidate = `${cleaned.slice(0, 31 - tag.length)}${tag}`;
  }
  usedNames.add(candidate);
  return candidate;
}

function inDateRange(
  dateStr: string,
  fromDate: string | null,
  toDate: string | null
): boolean {
  if (fromDate && dateStr < fromDate) return false;
  if (toDate && dateStr > toDate) return false;
  return true;
}

export async function buildAttendanceWorkbook(
  options: ExportOptions
): Promise<ExcelJS.Workbook> {
  const labels = {
    studentId: options.labels?.studentId ?? 'Student ID',
    name: options.labels?.name ?? 'Name',
    presencePct: options.labels?.presencePct ?? 'Presence %',
    summarySheet: options.labels?.summarySheet ?? 'Summary',
    classCol: options.labels?.classCol ?? 'Class',
    scannedCol: options.labels?.scannedCol ?? 'Scanned',
    totalSessionsCol: options.labels?.totalSessionsCol ?? 'Total Sessions',
  };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Class Attendance';
  workbook.created = new Date();

  const usedSheetNames = new Set<string>();
  if (options.includeSummary) {
    usedSheetNames.add(labels.summarySheet);
  }

  const allDatesSet = new Set<string>();
  const filteredByClass = options.bundles.map((bundle) => {
    const records = bundle.attendance.filter((rec) =>
      inDateRange(rec.sessionDate, options.fromDate, options.toDate)
    );
    const classSessionDates = new Set<string>();
    const presentSet = new Set<string>();

    for (const rec of records) {
      allDatesSet.add(rec.sessionDate);
      classSessionDates.add(rec.sessionDate);
      presentSet.add(`${rec.schoolStudentId}__${rec.sessionDate}`);
    }

    return {
      ...bundle,
      classSessionDates,
      presentSet,
    };
  });

  const sortedAllDates = Array.from(allDatesSet).sort();

  const summaryRows: Array<{
    className: string;
    studentId: string;
    studentName: string;
    scanned: number;
    totalSessions: number;
    presenceRatio: number;
  }> = [];

  for (const item of filteredByClass) {
    const sheetName = sanitizeSheetName(item.classDoc.name, usedSheetNames);
    const sheet = workbook.addWorksheet(sheetName, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    const headers = [
      labels.studentId,
      labels.name,
      ...sortedAllDates,
      labels.presencePct,
    ];
    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    const totalClassSessions = item.classSessionDates.size;

    const studentById = new Map<string, Student>();
    for (const st of item.students) {
      studentById.set(st.schoolStudentId, st);
    }
    for (const sid of item.classDoc.studentIds) {
      if (!studentById.has(sid)) {
        studentById.set(sid, {
          schoolStudentId: sid,
          name: sid,
          deviceUid: '',
          publicKeyJwk: { kty: 'EC', crv: 'P-256' },
          keyFingerprint: '',
          selfiePath: '',
          selfieHash: '',
          registrationTimestamp: 0,
          rotatedKeys: [],
        });
      }
    }

    const sortedStudents = Array.from(studentById.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    for (const student of sortedStudents) {
      let scannedCount = 0;
      const dateCells = sortedAllDates.map((d) => {
        if (!item.classSessionDates.has(d)) {
          return '—';
        }
        if (item.presentSet.has(`${student.schoolStudentId}__${d}`)) {
          scannedCount += 1;
          return '✓';
        }
        return 'A';
      });

      const presenceRatio =
        totalClassSessions > 0 ? scannedCount / totalClassSessions : 0;

      const row = sheet.addRow([
        student.schoolStudentId,
        student.name,
        ...dateCells,
        presenceRatio,
      ]);

      const pctCell = row.getCell(headers.length);
      pctCell.numFmt = '0.0%';

      for (let col = 3; col < headers.length; col++) {
        row.getCell(col).alignment = { horizontal: 'center' };
      }

      summaryRows.push({
        className: item.classDoc.name,
        studentId: student.schoolStudentId,
        studentName: student.name,
        scanned: scannedCount,
        totalSessions: totalClassSessions,
        presenceRatio,
      });
    }

    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, sortedStudents.length + 1), column: headers.length },
    };

    sheet.columns.forEach((column, idx) => {
      if (idx === 0) column.width = 16;
      else if (idx === 1) column.width = 24;
      else if (idx === headers.length - 1) column.width = 14;
      else column.width = 13;
    });
  }

  if (options.includeSummary) {
    const summarySheet = workbook.addWorksheet(labels.summarySheet, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    const summaryHeaders = [
      labels.classCol,
      labels.studentId,
      labels.name,
      labels.scannedCol,
      labels.totalSessionsCol,
      labels.presencePct,
    ];
    const headerRow = summarySheet.addRow(summaryHeaders);
    headerRow.font = { bold: true };

    for (const s of summaryRows) {
      const row = summarySheet.addRow([
        s.className,
        s.studentId,
        s.studentName,
        s.scanned,
        s.totalSessions,
        s.presenceRatio,
      ]);
      row.getCell(6).numFmt = '0.0%';
    }

    summarySheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, summaryRows.length + 1), column: 6 },
    };
    summarySheet.columns = [
      { width: 24 },
      { width: 16 },
      { width: 24 },
      { width: 12 },
      { width: 16 },
      { width: 14 },
    ];
  }

  return workbook;
}

export async function generateExportFilename(
  fromDate: string | null,
  toDate: string | null
): Promise<string> {
  const from = fromDate || 'all';
  const to = toDate || 'time';
  return `attendance_export_${from}_${to}.xlsx`;
}

export async function downloadWorkbookXlsx(
  workbook: ExcelJS.Workbook,
  filename: string
): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
