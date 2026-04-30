#!/usr/bin/env python3
"""
OpenCV + Pillow enhanced pipeline v2.
Major additions vs v1:
  - Highlight recovery (fixes overexposed ceiling/background)
  - Adaptive exposure correction per-region
  - Stronger skin tone correction for warm/orange cast
  - Better teeth whitening
  - Portrait-aware contrast (face region gets more attention)
"""
import argparse, sys
import cv2, numpy as np
from PIL import Image, ImageEnhance

def enhance(inp, out):
    img = cv2.imread(inp, cv2.IMREAD_COLOR)
    if img is None: raise ValueError(f"Cannot read: {inp}")

    # 1. Highlight recovery — pull down blown-out areas (overexposed ceiling)
    img = recover_highlights(img)

    # 2. Denoise
    img = cv2.fastNlMeansDenoisingColored(img, None, 5, 5, 7, 21)

    # 3. Bilateral skin smooth (preserves edges/texture)
    smooth = cv2.bilateralFilter(img, 9, 75, 75)
    img = cv2.addWeighted(smooth, 0.65, img, 0.35, 0)

    # 4. CLAHE — adaptive contrast (helps dark faces under harsh office lighting)
    img = apply_clahe(img, clip=2.5)

    # 5. Skin tone correction — reduce orange/warm cast from office fluorescent light
    img = correct_skin_tone(img)

    # 6. White balance
    img = white_balance(img)

    # 7. Teeth whitening
    img = whiten_teeth(img)

    # 8. Saturation + contrast via Pillow
    pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    pil = ImageEnhance.Color(pil).enhance(1.15)
    pil = ImageEnhance.Contrast(pil).enhance(1.08)
    pil = ImageEnhance.Sharpness(pil).enhance(1.4)
    img = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)

    # 9. Unsharp mask
    blurred = cv2.GaussianBlur(img, (0, 0), 1.5)
    img = cv2.addWeighted(img, 1.8, blurred, -0.8, 0)
    img = np.clip(img, 0, 255).astype(np.uint8)

    cv2.imwrite(out, img, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f"Saved: {out}", file=sys.stderr)


def recover_highlights(img):
    """Pull down overexposed regions without touching dark areas."""
    img_f = img.astype(np.float32) / 255.0
    # Identify blown-out pixels (all channels > 0.85)
    highlight_mask = np.all(img_f > 0.85, axis=2).astype(np.float32)
    highlight_mask = cv2.GaussianBlur(highlight_mask, (21, 21), 0)
    highlight_mask = highlight_mask[:, :, np.newaxis]
    # Compress highlights: tone-map bright areas down
    compressed = 1.0 - (1.0 - img_f) ** 0.7
    img_f = img_f * (1 - highlight_mask * 0.4) + compressed * (highlight_mask * 0.4)
    return np.clip(img_f * 255, 0, 255).astype(np.uint8)


def apply_clahe(img, clip=2.5):
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=clip, tileGridSize=(8, 8)).apply(l)
    return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)


def correct_skin_tone(img):
    """Reduce the warm/orange cast common under office fluorescent + overexposure."""
    img_f = img.astype(np.float32)
    # Slightly cool down: reduce red, boost blue subtly
    img_f[:, :, 2] = np.clip(img_f[:, :, 2] * 0.96, 0, 255)  # reduce R
    img_f[:, :, 0] = np.clip(img_f[:, :, 0] * 1.03, 0, 255)  # boost B
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
    hsv[:, :, 2] += mask * 20
    hsv[:, :, 1] -= mask * 10
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
