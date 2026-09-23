export const DEFAULT_MAX_IMAGE_DIMENSION = 2200;
export const JPEG_QUALITY_LADDER = Object.freeze([0.88, 0.78, 0.68, 0.58, 0.48]);

export function fitWithinMaxDimension(width, height, maxDimension = DEFAULT_MAX_IMAGE_DIMENSION) {
  const sourceWidth = Number(width);
  const sourceHeight = Number(height);
  const max = Number(maxDimension);

  if (!Number.isFinite(sourceWidth) || sourceWidth <= 0 ||
      !Number.isFinite(sourceHeight) || sourceHeight <= 0 ||
      !Number.isFinite(max) || max <= 0) {
    throw new TypeError('Image dimensions and maxDimension must be positive finite numbers');
  }

  const scale = Math.min(1, max / Math.max(sourceWidth, sourceHeight));
  return {
    scale,
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale))
  };
}

export function shouldOptimizeImage(fileBytes, maxUploadBytes) {
  const bytes = Number(fileBytes);
  const limit = Number(maxUploadBytes);
  if (!Number.isFinite(bytes) || bytes < 0 || !Number.isFinite(limit) || limit <= 0) {
    return false;
  }
  return bytes > limit;
}
