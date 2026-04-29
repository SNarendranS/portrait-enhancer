/**
 * Cloudinary — AI image transformations
 * Free: generous transformation limits on free plan
 * Sign up: https://cloudinary.com/users/register_free
 *
 * Uses URL-based AI transformations available on the free tier.
 * NOTE: gen_enhance requires the "AI Background Removal" add-on (paid).
 * This version uses only built-in free transformations:
 *   - improve (auto colour/exposure)
 *   - sharpen
 *   - viesus_correct (vibrance/saturation)
 *   - upscale
 */

import { v2 as cloudinary } from "cloudinary";
import axios from "axios";

function configureCloudinary() {
  if (!process.env.CLOUDINARY_CLOUD_NAME) throw new Error("CLOUDINARY_CLOUD_NAME not set");
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

export async function enhanceWithCloudinary(imageBuffer, mimeType) {
  configureCloudinary();

  // 1. Upload original image
  const uploadResult = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "portrait-enhancer", resource_type: "image" },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(imageBuffer);
  });

  const publicId = uploadResult.public_id;

  try {
    // 2. Build enhancement URL with free-tier AI transformations
    //    - improve:outdoor   — auto colour + contrast fix
    //    - viesus_correct    — intelligent vibrance correction
    //    - sharpen:100       — edge sharpening
    //    - upscale           — AI upscale (free tier, 2×)
    const enhancedUrl = cloudinary.url(publicId, {
      transformation: [
        { effect: "improve:outdoor:50" },
        { effect: "viesus_correct" },
        { effect: "sharpen:80" },
        { quality: "auto:best" },
        { fetch_format: "jpg" },
      ],
      secure: true,
    });

    // 3. Download the enhanced image as buffer
    const downloadRes = await axios.get(enhancedUrl, {
      responseType: "arraybuffer",
      timeout: 45_000,
    });

    return {
      imageBase64: Buffer.from(downloadRes.data).toString("base64"),
      mimeType:    "image/jpeg",
    };
  } finally {
    // Clean up uploaded original
    try { await cloudinary.uploader.destroy(publicId); } catch (_) {}
  }
}