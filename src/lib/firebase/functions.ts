import { httpsCallable } from 'firebase/functions';
import { functions } from './client';
import type { QrPayload, Student } from '../../types';

export interface RegisterFirstScanResponse {
  status: 'REGISTERED' | 'ROTATION_REQUIRED';
  student: Student;
  /** Server-verified selfie (already downloaded/hashed by the Cloud Function). */
  selfieDataUrl?: string;
  rotationSelfieDataUrl?: string;
  storedSelfieDataUrl?: string;
}

export interface ApproveRotationResponse {
  status: 'ROTATED';
  student: Student;
  selfieDataUrl: string;
}

export interface GetRotationSelfieResponse {
  selfieDataUrl: string;
}

export type ManageClassAction = 'rename' | 'archive' | 'unarchive';

export interface ManageClassResponse {
  classId: string;
  action: ManageClassAction;
  name?: string;
  archived?: boolean;
}

const registerFirstScanCallable = httpsCallable<
  { qrPayload: QrPayload; classId: string },
  RegisterFirstScanResponse
>(functions, 'registerFirstScan');

const approveRotationCallable = httpsCallable<
  { qrPayload: QrPayload; classId: string },
  ApproveRotationResponse
>(functions, 'approveRotation');

const getRotationSelfieCallable = httpsCallable<
  { qrPayload: QrPayload; classId: string },
  GetRotationSelfieResponse
>(functions, 'getRotationSelfie');

const manageClassCallable = httpsCallable<
  { classId: string; action: ManageClassAction; name?: string },
  ManageClassResponse
>(functions, 'manageClass');

export async function callRegisterFirstScan(
  qrPayload: QrPayload,
  classId: string
): Promise<RegisterFirstScanResponse> {
  const result = await registerFirstScanCallable({ qrPayload, classId });
  return result.data;
}

export async function callApproveRotation(
  qrPayload: QrPayload,
  classId: string
): Promise<ApproveRotationResponse> {
  const result = await approveRotationCallable({ qrPayload, classId });
  return result.data;
}

export async function callGetRotationSelfie(
  qrPayload: QrPayload,
  classId: string
): Promise<GetRotationSelfieResponse> {
  const result = await getRotationSelfieCallable({ qrPayload, classId });
  return result.data;
}

export async function callManageClass(
  classId: string,
  action: ManageClassAction,
  name?: string
): Promise<ManageClassResponse> {
  const payload: { classId: string; action: ManageClassAction; name?: string } = {
    classId,
    action,
  };
  if (name) payload.name = name;
  const result = await manageClassCallable(payload);
  return result.data;
}
