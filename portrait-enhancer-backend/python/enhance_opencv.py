#!/usr/bin/env python3
"""
OpenCV portrait enhancement — v4
Face-aware local tone mapping calibrated against Gemini reference output:
  - bg_top L: -116  (ceiling/light glare crushed)
  - face L:    -56  (face gently darkened for natural exposure)
  - saturation: +34 (pop restored after darkening)
  - full L:    -73

Key technique: 3-zone spatial gamma blending
  zone 1: face center  → gamma 1.2  (mild darkening)
  zone 2: mid bg       → gamma 2.0  (moderate darkening)
  zone 3: ceiling/top  → gamma 4.5  (aggressive, kills fluorescent blowout)
"""
import argparse, sys
import cv2, numpy as np
from PIL import Image, ImageEnhance


def enhance(inp, out):
    img = cv2.imread(inp, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"Cannot read: {inp}")

    # Step 1: Highlight recovery — compress blown-out areas first
    img_f = recover_highlights(img.astype(np.float32) / 255.0)

    # Step 2: 3-zone face-aware tone mapping (the core fix)
    img_f = face_aware_tone_map(img_f, img.shape)

    img = np.clip(img_f * 255, 0, 255).astype(np.uint8)

    # Step 3: Denoise
    img = cv2.fastNlMeansDenoisingColored(img, None, 4, 4, 7, 21)

    # Step 4: Bilateral skin smoothing
    smooth = cv2.bilateralFilter(img, 9, 65, 65)
    img = cv2.addWeighted(smooth, 0.55, img, 0.45, 0)

    # Step 5: CLAHE — mild, only to restore local contrast after darkening
    img = apply_clahe(img, clip=1.2)

    # Step 6: Saturation boost (raw=22, target=56, ~2.2x)
    pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    pil = ImageEnhance.Color(pil).enhance(1.85)
    pil = ImageEnhance.Contrast(pil).enhance(1.1)
    img = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)

    # Step 7: Skin tone warmth correction
    img = correct_skin_tone(img)

    # Step 8: White balance
    img = white_balance(img)

    # Step 9: Teeth whitening
    img = whiten_teeth(img)

    # Step 10: Mild sharpening
    blurred = cv2.GaussianBlur(img, (0, 0), 1.2)
    img = cv2.addWeighted(img, 1.4, blurred, -0.4, 0)
    img = np.clip(img, 0, 255).astype(np.uint8)

    cv2.imwrite(out, img, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f"Saved: {out}", file=sys.stderr)


def recover_highlights(img_f):
    """Tone-compress blown-out regions. threshold=0.70 catches office ceiling lights."""
    hmask = np.all(img_f > 0.70, axis=2).astype(np.float32)
    hmask = cv2.GaussianBlur(hmask, (31, 31), 0)[:, :, np.newaxis]
    compressed = 1.0 - (1.0 - img_f) ** 0.45
    return img_f * (1 - hmask * 0.75) + compressed * (hmask * 0.75)


def face_aware_tone_map(img_f, shape):
    """
    3-zone spatial gamma blending.
    Zone weights are soft Gaussian masks so there are no hard edges.
    Calibrated so bg_top_L ≈ 69, face_L ≈ 109 (matches Gemini reference).
    """
    h, w = shape[:2]

    # Face center mask (ellipse centered slightly above middle)
    cx, cy = w / 2, h * 0.45
    Y, X = np.mgrid[0:h, 0:w]
    dist = np.sqrt(((X - cx) / (w * 0.28)) ** 2 + ((Y - cy) / (h * 0.35)) ** 2)
    face_mask = cv2.GaussianBlur(
        np.clip(1.0 - dist, 0, 1).astype(np.float32), (61, 61), 0
    )[:, :, np.newaxis]

    # Ceiling/top mask (top 40% of frame)
    top_weight = np.zeros((h, w), np.float32)
    top_weight[: int(h * 0.4), :] = 1.0
    top_weight = cv2.GaussianBlur(top_weight, (61, 61), 0)[:, :, np.newaxis]

    img_c = np.clip(img_f, 1e-6, 1.0)

    # Each zone: power(x, gamma) — higher gamma = darker
    face_c = np.power(img_c, 1.2)   # mild darkening
    bg_c   = np.power(img_c, 2.0)   # moderate darkening
    top_c  = np.power(img_c, 4.5)   # aggressive — kills fluorescent blowout

    # Blend: face wins over bg; bg wins over top in overlapping areas
    bg_blend = top_weight * top_c + (1 - top_weight) * bg_c
    return face_mask * face_c + (1 - face_mask) * bg_blend


def apply_clahe(img, clip=1.2):
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=clip, tileGridSize=(8, 8)).apply(l)
    return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)


def correct_skin_tone(img):
    """Reduce warm/orange cast from fluorescent overexposure."""
    img_f = img.astype(np.float32)
    img_f[:, :, 2] = np.clip(img_f[:, :, 2] * 0.93, 0, 255)  # reduce R
    img_f[:, :, 0] = np.clip(img_f[:, :, 0] * 1.05, 0, 255)  # boost B
    return img_f.astype(np.uint8)


def white_balance(img):
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    avg_a = np.average(lab[:, :, 1])
    avg_b = np.average(lab[:, :, 2])
    lab[:, :, 1] -= (avg_a - 128) * (lab[:, :, 0] / 255.0) * 1.1
    lab[:, :, 2] -= (avg_b - 128) * (lab[:, :, 0] / 255.0) * 1.1
    return cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)


def whiten_teeth(img):
    H, W = img.shape[:2]
    y1, y2 = int(H * 0.45), int(H * 0.75)
    x1, x2 = int(W * 0.28), int(W * 0.72)
    roi = img[y1:y2, x1:x2].copy()
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV).astype(np.float32)
    mask = ((hsv[:, :, 2] > 140) & (hsv[:, :, 1] < 60)).astype(np.float32)
    mask = cv2.GaussianBlur(mask, (15, 15), 0)
    hsv[:, :, 2] += mask * 18
    hsv[:, :, 1] -= mask * 10
    img[y1:y2, x1:x2] = cv2.cvtColor(
        np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR
    )
    return img


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
