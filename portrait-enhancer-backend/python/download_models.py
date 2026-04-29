#!/usr/bin/env python3
"""
Download GFPGAN and Real-ESRGAN model weights.
Run once: python download_models.py
Models are saved to ./weights/ (~340MB total)
"""

import os
import urllib.request

WEIGHTS_DIR = os.path.join(os.path.dirname(__file__), "weights")
os.makedirs(WEIGHTS_DIR, exist_ok=True)

MODELS = [
    {
        "name": "GFPGANv1.4.pth",
        "url":  "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.4/GFPGANv1.4.pth",
        "size": "~330MB — face restoration (main model)",
    },
    {
        "name": "RealESRGAN_x2plus.pth",
        "url":  "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth",
        "size": "~67MB — 2x upscaling",
    },
    {
        "name": "detection_Resnet50_Final.pth",
        "url":  "https://github.com/xinntao/facexlib/releases/download/v0.1.0/detection_Resnet50_Final.pth",
        "size": "~104MB — face detection",
    },
    {
        "name": "parsing_parsenet.pth",
        "url":  "https://github.com/xinntao/facexlib/releases/download/v0.2.2/parsing_parsenet.pth",
        "size": "~85MB — face parsing",
    },
]


def download(url, dest_path, label):
    if os.path.exists(dest_path):
        print(f"  ✓ {label} already downloaded, skipping")
        return

    print(f"  ↓ Downloading {label}...")

    def progress(count, block_size, total_size):
        if total_size > 0:
            pct = count * block_size * 100 // total_size
            print(f"\r    {min(pct, 100)}%", end="", flush=True)

    urllib.request.urlretrieve(url, dest_path, reporthook=progress)
    print(f"\r  ✓ {label} saved to {dest_path}")


if __name__ == "__main__":
    print("\n📦 Downloading portrait enhancement models...\n")
    for m in MODELS:
        dest = os.path.join(WEIGHTS_DIR, m["name"])
        print(f"\n[{m['name']}] {m['size']}")
        download(m["url"], dest, m["name"])
    print("\n✅ All models ready. You can now run the server.\n")
