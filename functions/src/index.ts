import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';

initializeApp();
setGlobalOptions({ region: 'southamerica-east1' });

export { registerFirstScan } from './registerFirstScan';
export { approveRotation } from './approveRotation';
export { getRotationSelfie } from './getRotationSelfie';
export { getServerTime } from './getServerTime';
export { passkeyAuth } from './passkeyAuth';
export { verifyTurnstile } from './turnstile';
