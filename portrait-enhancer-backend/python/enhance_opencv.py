#!/usr/bin/env python3
"""
OpenCV portrait enhancement — v5

Root-cause fix for neon yellow/orange artifacts in v4:
  ALL luminance changes done in LAB L-channel only (cv2 LAB: L is 0–255).
  v4 used BGR power() curves which rotated hue → neon yellow/green on lights.

Pipeline:
  1. BGR → LAB; recover highlights in L only (threshold=237/255)
  2. 3-zone face-aware tone map in L only
  3. LAB → BGR
  4. Denoise + bilateral skin smooth
  5. CLAHE (L only, clip=1.0)
  6. Gentle saturation boost (1.3×)
  7. Reduce orange skin cast (−3% R, +1% B)
  8. Grey-world white balance (luminance-weighted)
  9. Teeth whitening
  10. Mild unsharp mask
"""
import argparse, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from tone_utils import recover_highlights_L, face_aware_tone_map_L

import cv2, numpy as np
from PIL import Image, ImageEnhance


def apply_clahe_L(bgr_u8, clip=1.0):
    lab = cv2.cvtColor(bgr_u8, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=clip, tileGridSize=(8, 8)).apply(l)
    return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)


def white_balance(bgr_u8):
    """Luminance-weighted grey-world white balance in LAB."""
    lab = cv2.cvtColor(bgr_u8, cv2.COLOR_BGR2LAB).astype(np.float32)
    L, A, B = lab[:, :, 0], lab[:, :, 1], lab[:, :, 2]
    w = L / 255.0
    wa = np.sum(A * w) / (np.sum(w) + 1e-6)
    wb = np.sum(B * w) / (np.sum(w) + 1e-6)
    # 128 = neutral in cv2 LAB (A/B range 0-255, neutral=128)
    A = np.clip(A - (wa - 128) * 0.7, 0, 255)
    B = np.clip(B - (wb - 128) * 0.7, 0, 255)
    lab[:, :, 1] = A
    lab[:, :, 2] = B
    return cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2BGR)


def whiten_teeth(img):
    H, W = img.shape[:2]
    y1, y2 = int(H * 0.50), int(H * 0.72)
    x1, x2 = int(W * 0.30), int(W * 0.70)
    roi = img[y1:y2, x1:x2].copy()
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV).astype(np.float32)
    mask = ((hsv[:, :, 2] > 130) & (hsv[:, :, 1] < 55)).astype(np.float32)
    mask = cv2.GaussianBlur(mask, (11, 11), 0)
    hsv[:, :, 2] = np.clip(hsv[:, :, 2] + mask * 15, 0, 255)
    hsv[:, :, 1] = np.clip(hsv[:, :, 1] - mask * 8, 0, 255)
    img[y1:y2, x1:x2] = cv2.cvtColor(
        np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR)
    return img


def enhance(inp, out):
    bgr = cv2.imread(inp, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError(f"Cannot read: {inp}")

    # ── Steps 1-2: ALL darkening in LAB L-channel only ────────────────────────
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    L = lab[:, :, 0]                         # 0–255 range
    L = recover_highlights_L(L)
    L = face_aware_tone_map_L(L, bgr.shape)
    lab[:, :, 0] = np.clip(L, 0, 255)
    bgr = cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2BGR)
    # ─────────────────────────────────────────────────────────────────────────

    # Step 3: Denoise
    bgr = cv2.fastNlMeansDenoisingColored(bgr, None, 3, 3, 7, 21)

    # Step 4: Bilateral skin smoothing
    smooth = cv2.bilateralFilter(bgr, 9, 55, 55)
    bgr = cv2.addWeighted(smooth, 0.5, bgr, 0.5, 0)

    # Step 5: Mild CLAHE (L only)
    bgr = apply_clahe_L(bgr, clip=1.0)

    # Step 6: Gentle saturation boost
    pil = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    pil = ImageEnhance.Color(pil).enhance(1.3)
    bgr = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)

    # Step 7: Slight orange-cast correction
    bgr_f = bgr.astype(np.float32)
    bgr_f[:, :, 2] = np.clip(bgr_f[:, :, 2] * 0.97, 0, 255)  # R −3%
    bgr_f[:, :, 0] = np.clip(bgr_f[:, :, 0] * 1.01, 0, 255)  # B +1%
    bgr = bgr_f.astype(np.uint8)

    # Step 8: White balance
    bgr = white_balance(bgr)

    # Step 9: Teeth whitening
    bgr = whiten_teeth(bgr)

    # Step 10: Mild unsharp mask
    blurred = cv2.GaussianBlur(bgr, (0, 0), 1.0)
    bgr = cv2.addWeighted(bgr, 1.35, blurred, -0.35, 0)
    bgr = np.clip(bgr, 0, 255).astype(np.uint8)

    cv2.imwrite(out, bgr, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f"Saved: {out}", file=sys.stderr)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--input",  required=True)
    p.add_argument("--output", required=True)
    args = p.parse_args()
    try:
        enhance(args.input, args.output)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
