import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';

initializeApp();
setGlobalOptions({ region: 'southamerica-east1' });

export { manageClass } from './manageClass';
export { registerFirstScan } from './registerFirstScan';
export { approveRotation } from './approveRotation';
export { getRotationSelfie } from './getRotationSelfie';
export { getKeyStatus } from './keyStatus';
export { getServerTime } from './getServerTime';
export { passkeyAuth } from './passkeyAuth';
export { verifyTurnstile } from './turnstile';
