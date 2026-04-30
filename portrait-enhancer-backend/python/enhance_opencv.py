#!/usr/bin/env python3
"""
OpenCV + Pillow portrait enhancement pipeline v3.
Fixes vs v2:
  - Gamma correction first to dim overexposed office lighting
  - Softer highlight recovery (more aggressive threshold + strength)
  - CLAHE clip reduced to 1.5 (was 2.5) — avoids artificial brightening
  - Unsharp mask strength reduced (was 1.8/-0.8, now 1.4/-0.4)
  - Saturation/sharpness dialed back
"""
import argparse, sys
import cv2, numpy as np
from PIL import Image, ImageEnhance

def enhance(inp, out):
    img = cv2.imread(inp, cv2.IMREAD_COLOR)
    if img is None: raise ValueError(f"Cannot read: {inp}")

    # 1. Gamma correction — dim overall exposure first (office lighting is harsh)
    img = gamma_correct(img, gamma=1.25)  # >1 darkens, fixes overexposed office shot

    # 2. Highlight recovery — pull down blown-out ceiling/background
    img = recover_highlights(img)

    # 3. Denoise (mild)
    img = cv2.fastNlMeansDenoisingColored(img, None, 4, 4, 7, 21)

    # 4. Bilateral skin smooth
    smooth = cv2.bilateralFilter(img, 9, 60, 60)
    img = cv2.addWeighted(smooth, 0.55, img, 0.45, 0)

    # 5. CLAHE — reduced clip to avoid overbright
    img = apply_clahe(img, clip=1.5)

    # 6. Skin tone correction — reduce warm/orange cast
    img = correct_skin_tone(img)

    # 7. White balance
    img = white_balance(img)

    # 8. Teeth whitening
    img = whiten_teeth(img)

    # 9. Saturation + contrast via Pillow (gentler than before)
    pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    pil = ImageEnhance.Color(pil).enhance(1.10)
    pil = ImageEnhance.Contrast(pil).enhance(1.05)
    pil = ImageEnhance.Sharpness(pil).enhance(1.2)
    img = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)

    # 10. Mild unsharp mask
    blurred = cv2.GaussianBlur(img, (0, 0), 1.5)
    img = cv2.addWeighted(img, 1.4, blurred, -0.4, 0)
    img = np.clip(img, 0, 255).astype(np.uint8)

    cv2.imwrite(out, img, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f"Saved: {out}", file=sys.stderr)


def gamma_correct(img, gamma=1.25):
    """gamma > 1 darkens image (corrects overexposure)."""
    inv_gamma = 1.0 / gamma
    table = np.array([
        ((i / 255.0) ** inv_gamma) * 255
        for i in range(256)
    ]).astype(np.uint8)
    return cv2.LUT(img, table)


def recover_highlights(img):
    """Pull down overexposed regions without touching dark areas."""
    img_f = img.astype(np.float32) / 255.0
    # Lower threshold (0.78 vs 0.85) catches more overexposed office ceiling
    highlight_mask = np.all(img_f > 0.78, axis=2).astype(np.float32)
    highlight_mask = cv2.GaussianBlur(highlight_mask, (31, 31), 0)
    highlight_mask = highlight_mask[:, :, np.newaxis]
    # More aggressive tone-map
    compressed = 1.0 - (1.0 - img_f) ** 0.6
    img_f = img_f * (1 - highlight_mask * 0.55) + compressed * (highlight_mask * 0.55)
    return np.clip(img_f * 255, 0, 255).astype(np.uint8)


def apply_clahe(img, clip=1.5):
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=clip, tileGridSize=(8, 8)).apply(l)
    return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)


def correct_skin_tone(img):
    """Reduce warm/orange cast from office fluorescent overexposure."""
    img_f = img.astype(np.float32)
    img_f[:, :, 2] = np.clip(img_f[:, :, 2] * 0.95, 0, 255)  # reduce R
    img_f[:, :, 0] = np.clip(img_f[:, :, 0] * 1.04, 0, 255)  # boost B
    return img_f.astype(np.uint8)


def white_balance(img):
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    avg_a, avg_b = np.average(lab[:, :, 1]), np.average(lab[:, :, 2])
    lab[:, :, 1] -= (avg_a - 128) * (lab[:, :, 0] / 255.0) * 1.1
    lab[:, :, 2] -= (avg_b - 128) * (lab[:, :, 0] / 255.0) * 1.1
    return cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)


def whiten_teeth(img):
    H, W = img.shape[:2]
    y1, y2 = int(H * 0.45), int(H * 0.75)
    x1, x2 = int(W * 0.28), int(W * 0.72)
    roi = img[y1:y2, x1:x2].copy()
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV).astype(np.float32)
    mask = ((hsv[:, :, 2] > 150) & (hsv[:, :, 1] < 55)).astype(np.float32)
    mask = cv2.GaussianBlur(mask, (15, 15), 0)
    hsv[:, :, 2] += mask * 15
    hsv[:, :, 1] -= mask * 8
    img[y1:y2, x1:x2] = cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR)
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
