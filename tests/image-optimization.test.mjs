import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_MAX_IMAGE_DIMENSION,
  JPEG_QUALITY_LADDER,
  fitWithinMaxDimension,
  shouldOptimizeImage
} from '../lib/image-optimization.js';

test('large landscape image is scaled to max dimension while preserving aspect ratio', () => {
  const fitted = fitWithinMaxDimension(4032, 3024);
  assert.equal(DEFAULT_MAX_IMAGE_DIMENSION, 2200);
  assert.equal(fitted.width, 2200);
  assert.equal(fitted.height, 1650);
  assert.ok(fitted.scale < 1);
});

test('large portrait image is scaled to max dimension while preserving aspect ratio', () => {
  const fitted = fitWithinMaxDimension(3024, 4032);
  assert.equal(fitted.width, 1650);
  assert.equal(fitted.height, 2200);
});

test('small image is never upscaled', () => {
  const fitted = fitWithinMaxDimension(1200, 900);
  assert.equal(fitted.scale, 1);
  assert.equal(fitted.width, 1200);
  assert.equal(fitted.height, 900);
});

test('image optimization is required only above upload limit', () => {
  const limit = 3 * 1024 * 1024;
  assert.equal(shouldOptimizeImage(limit, limit), false);
  assert.equal(shouldOptimizeImage(limit + 1, limit), true);
  assert.equal(shouldOptimizeImage(1024, limit), false);
});

test('JPEG quality ladder is descending and bounded', () => {
  assert.deepEqual(Array.from(JPEG_QUALITY_LADDER), [0.88,0.78,0.68,0.58,0.48]);
  for (let i = 0; i < JPEG_QUALITY_LADDER.length; i++) {
    const value = JPEG_QUALITY_LADDER[i];
    assert.ok(value > 0 && value <= 1);
    if (i > 0) assert.ok(value < JPEG_QUALITY_LADDER[i - 1]);
  }
});

test('invalid dimensions are rejected', () => {
  assert.throws(() => fitWithinMaxDimension(0, 100), TypeError);
  assert.throws(() => fitWithinMaxDimension(100, -1), TypeError);
});
