import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { registerFirstScan } from './registerFirstScan';
export { approveRotation } from './approveRotation';
export { getServerTime } from './getServerTime';
export { passkeyAuth } from './passkeyAuth';
