"""
Shared tone-mapping utilities for all enhancement scripts.

cv2.COLOR_BGR2LAB encodes L in 0–255 (not 0–100).
All thresholds and multipliers here are on the 0–255 L scale.
"""
import cv2
import numpy as np


def recover_highlights_L(L):
    """
    Soft rolloff for blown-out highlights (L > 237, i.e. > ~93% brightness).
    Brings them down without touching colour channels → no hue shift.
    """
    threshold = 237.0          # 237/255 ≈ L=93 on 0-100 scale
    mask = np.clip((L - threshold) / (255.0 - threshold + 1e-6), 0, 1)
    mask = cv2.GaussianBlur(mask, (31, 31), 0)
    # Compress: pixels above threshold converge toward threshold
    compressed = threshold + (L - threshold) * 0.20
    return L * (1 - mask) + compressed * mask


def face_aware_tone_map_L(L, shape):
    """
    3-zone spatial darkening — L channel only.
    All multipliers calibrated on 0-255 L scale.

    Targets for office webcam (raw face L ≈ 162, ceiling L ≈ 178):
      face    → × 0.87  ≈ L 141  (natural, slightly brighter than neutral)
      mid bg  → × 0.70  ≈ L 133  (moderate — reduce washed-out wall)
      ceiling → × 0.52  ≈ L  93  (kill fluorescent blowout aggressively)
    """
    h, w = shape[:2]

    # Soft ellipse centred on face (slightly above mid-frame)
    cx, cy = w / 2, h * 0.45
    Y, X = np.mgrid[0:h, 0:w]
    dist = np.sqrt(((X - cx) / (w * 0.30)) ** 2 + ((Y - cy) / (h * 0.38)) ** 2)
    face_mask = cv2.GaussianBlur(
        np.clip(1.0 - dist, 0, 1).astype(np.float32), (71, 71), 0
    )

    # Top 40% = ceiling zone
    top_mask = np.zeros((h, w), np.float32)
    top_mask[: int(h * 0.40), :] = 1.0
    top_mask = cv2.GaussianBlur(top_mask, (71, 71), 0)

    face_L = L * 0.87
    bg_L   = L * 0.70
    top_L  = L * 0.52

    bg_blend = top_mask * top_L + (1 - top_mask) * bg_L
    return face_mask * face_L + (1 - face_mask) * bg_blend
