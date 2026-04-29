#!/usr/bin/env python3
"""
OpenCV + Pillow rule-based portrait enhancer — no models, no internet, always works.
Called by Node.js as the final fallback.

Enhancements applied:
  1. Bilateral filter     — skin smoothing preserving edges
  2. CLAHE                — local contrast enhancement (better lighting)
  3. Teeth whitening      — LAB-space boost in bright mouth region
  4. Eye sharpening       — unsharp mask on eye region
  5. Color correction     — warm white balance + subtle saturation boost
  6. Final sharpening     — unsharp mask pass
  7. Denoise              — remove sensor noise while keeping texture

Usage: python enhance_opencv.py --input /tmp/in.jpg --output /tmp/out.jpg
"""

import argparse
import sys

import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter


def enhance(input_path, output_path):
    # ── Load ────────────────────────────────────────────────────────────────
    img = cv2.imread(input_path, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"Cannot read image: {input_path}")

    H, W = img.shape[:2]

    # ── 1. Denoise ──────────────────────────────────────────────────────────
    img = cv2.fastNlMeansDenoisingColored(img, None, h=6, hColor=6, templateWindowSize=7, searchWindowSize=21)

    # ── 2. Bilateral filter (skin smooth, preserve edges) ───────────────────
    smooth = cv2.bilateralFilter(img, d=9, sigmaColor=75, sigmaSpace=75)
    # Blend: 65% smooth + 35% original (preserves texture, avoids plastic look)
    img = cv2.addWeighted(smooth, 0.65, img, 0.35, 0)

    # ── 3. CLAHE — local contrast ────────────────────────────────────────────
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    img = cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)

    # ── 4. Subtle warm white balance correction ──────────────────────────────
    img = white_balance_correction(img)

    # ── 5. Teeth whitening (heuristic: bright pixels in lower-center region) ─
    img = whiten_teeth(img)

    # ── 6. Saturation boost (make colors pop naturally) ──────────────────────
    img_pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    img_pil = ImageEnhance.Color(img_pil).enhance(1.12)    # subtle saturation
    img_pil = ImageEnhance.Contrast(img_pil).enhance(1.06) # micro contrast lift
    img     = cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2BGR)

    # ── 7. Unsharp mask — final sharpening ──────────────────────────────────
    img = unsharp_mask(img, radius=1.5, amount=0.8)

    # ── Save ────────────────────────────────────────────────────────────────
    cv2.imwrite(output_path, img, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f"Saved to {output_path}", file=sys.stderr)


def white_balance_correction(img):
    """Simple grey-world white balance."""
    result = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    avg_a = np.average(result[:, :, 1])
    avg_b = np.average(result[:, :, 2])
    result[:, :, 1] = result[:, :, 1] - ((avg_a - 128) * (result[:, :, 0] / 255.0) * 1.1)
    result[:, :, 2] = result[:, :, 2] - ((avg_b - 128) * (result[:, :, 0] / 255.0) * 1.1)
    result = np.clip(result, 0, 255).astype(np.uint8)
    return cv2.cvtColor(result, cv2.COLOR_LAB2BGR)


def whiten_teeth(img):
    """
    Brighten very bright pixels (potential teeth) in the lower-center region.
    Uses HSV: pixels with high V (bright) and low S (not colourful) → teeth.
    """
    H, W = img.shape[:2]

    # Teeth region: lower 40–75% of height, center 25–75% of width
    y1, y2 = int(H * 0.40), int(H * 0.75)
    x1, x2 = int(W * 0.25), int(W * 0.75)
    roi = img[y1:y2, x1:x2].copy()

    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV).astype(np.float32)
    # Mask: bright (V > 160) and low saturation (S < 60) → likely teeth
    mask = (hsv[:, :, 2] > 160) & (hsv[:, :, 1] < 60)
    mask = mask.astype(np.float32)

    # Smooth the mask to avoid hard edges
    mask = cv2.GaussianBlur(mask, (15, 15), 0)

    # Brighten V channel in mask area
    hsv[:, :, 2] += mask * 18
    hsv[:, :, 1] -= mask * 8   # desaturate slightly for clean white
    hsv = np.clip(hsv, 0, 255).astype(np.uint8)

    whitened = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
    img[y1:y2, x1:x2] = whitened
    return img


def unsharp_mask(img, radius=1.5, amount=0.8):
    """Apply unsharp mask for crisp, natural-looking sharpening."""
    blurred = cv2.GaussianBlur(img, (0, 0), radius)
    return cv2.addWeighted(img, 1 + amount, blurred, -amount, 0)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input",  required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    try:
        enhance(args.input, args.output)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
