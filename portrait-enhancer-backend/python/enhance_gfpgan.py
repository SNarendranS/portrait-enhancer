#!/usr/bin/env python3
"""
GFPGAN + Real-ESRGAN portrait enhancer — v5

Root-cause fix for neon yellow/orange artifacts in v4:
  ALL luminance changes in LAB L-channel only (cv2 LAB: L is 0-255).
  v4 used BGR power() curves which rotated hue → neon yellow/green lights.
"""
import argparse, os, sys, types as _types

def _patch_torchvision():
    try:
        import torchvision.transforms.functional as _F
    except ImportError:
        return
    _mod_name = "torchvision.transforms.functional_tensor"
    if _mod_name not in sys.modules:
        _ft = _types.ModuleType(_mod_name)
        for _attr in dir(_F):
            setattr(_ft, _attr, getattr(_F, _attr))
        sys.modules[_mod_name] = _ft

_patch_torchvision()

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tone_utils import recover_highlights_L, face_aware_tone_map_L

import cv2, numpy as np

WEIGHTS_DIR  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "weights")
GFPGAN_MODEL = os.path.join(WEIGHTS_DIR, "GFPGANv1.4.pth")


def check_models():
    if not os.path.exists(GFPGAN_MODEL):
        raise FileNotFoundError(
            f"GFPGAN model not found at {GFPGAN_MODEL}\nRun: python download_models.py")


def _preload_facexlib():
    detection_model = os.path.join(WEIGHTS_DIR, "detection_Resnet50_Final.pth")
    parsing_model   = os.path.join(WEIGHTS_DIR, "parsing_parsenet.pth")
    if not os.path.exists(detection_model) or not os.path.exists(parsing_model):
        print("  [warn] facexlib weights not found — first run will download them.", file=sys.stderr)
        return
    try:
        from facexlib.detection import init_detection_model
        from facexlib.parsing  import init_parsing_model
        print("  -> pre-loading facexlib detection model...", file=sys.stderr)
        init_detection_model("retinaface_resnet50", half=False, device="cpu", model_rootpath=WEIGHTS_DIR)
        print("  -> pre-loading facexlib parsing model...", file=sys.stderr)
        init_parsing_model(model_name="parsenet", device="cpu", model_rootpath=WEIGHTS_DIR)
    except Exception as e:
        print(f"  [warn] facexlib pre-load skipped: {e}", file=sys.stderr)


def enhance(input_path, output_path):
    check_models()
    _preload_facexlib()

    from gfpgan import GFPGANer
    from basicsr.archs.rrdbnet_arch import RRDBNet
    from realesrgan import RealESRGANer

    realesrgan_model_path = os.path.join(WEIGHTS_DIR, "RealESRGAN_x2plus.pth")
    bg_upsampler = None
    if os.path.exists(realesrgan_model_path):
        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=2)
        bg_upsampler = RealESRGANer(scale=2, model_path=realesrgan_model_path, model=model,
                                     tile=400, tile_pad=10, pre_pad=0, half=False)

    restorer = GFPGANer(model_path=GFPGAN_MODEL, upscale=2, arch="clean",
                        channel_multiplier=2, bg_upsampler=bg_upsampler)

    img = cv2.imread(input_path, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"Cannot read image: {input_path}")

    # ── Pre-process: ALL darkening in LAB L-channel only ─────────────────────
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    L = lab[:, :, 0]  # 0-255 range
    L = recover_highlights_L(L)
    L = face_aware_tone_map_L(L, img.shape)
    lab[:, :, 0] = np.clip(L, 0, 255)
    img = cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2BGR)
    # ─────────────────────────────────────────────────────────────────────────

    _, _, output = restorer.enhance(img, has_aligned=False, only_center_face=False,
                                    paste_back=True, weight=0.5)

    # Mild sharpening only — GFPGAN output is already vivid, no saturation boost needed
    kernel = np.array([[0, -0.25, 0], [-0.25, 2.0, -0.25], [0, -0.25, 0]])
    output = cv2.filter2D(output, -1, kernel)
    output = np.clip(output, 0, 255).astype(np.uint8)

    cv2.imwrite(output_path, output, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f"Saved enhanced image to {output_path}", file=sys.stderr)


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
