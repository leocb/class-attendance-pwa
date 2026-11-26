/**
 * Requests a camera stream with graceful fallbacks. Some browsers and desktops
 * reject `facingMode`/resolution constraints with OverconstrainedError; retrying
 * with looser constraints avoids the "camera sometimes doesn't open" failure.
 */
export async function openCameraStream(
  facingMode: 'user' | 'environment',
  idealSize = 1280
): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException('Camera API unavailable', 'NotSupportedError');
  }

  const attempts: MediaStreamConstraints[] = [
    {
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: idealSize },
        height: { ideal: idealSize },
      },
      audio: false,
    },
    { video: { facingMode }, audio: false },
    { video: true, audio: false },
  ];

  let lastError: unknown;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
      // Only constraint mismatches are worth retrying; permission/device
      // errors would fail again and may re-prompt the user.
      if (!(err instanceof DOMException) || err.name !== 'OverconstrainedError') {
        throw err;
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new DOMException('Camera unavailable', 'NotFoundError');
}
