/**
 * Cloudinary — AI image transformations
 * Free: 25 credits/month + generous transformation limits on free plan
 * Sign up: https://cloudinary.com/users/register_free
 *
 * Uses URL-based AI transformations — no ML inference cost on our side.
 */

import { v2 as cloudinary } from "cloudinary";
import axios from "axios";

function configureCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

export async function enhanceWithCloudinary(imageBuffer, mimeType) {
  if (!process.env.CLOUDINARY_CLOUD_NAME) throw new Error("CLOUDINARY_CLOUD_NAME not set");
  configureCloudinary();

  // 1. Upload original image
  const uploadResult = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder:         "portrait-enhancer",
        resource_type:  "image",
        transformation: [], // raw upload, transform via URL
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(imageBuffer);
  });

  const publicId = uploadResult.public_id;

  // 2. Build enhancement URL with AI transformations
  const enhancedUrl = cloudinary.url(publicId, {
    transformation: [
      { effect: "gen_enhance" },         // AI-powered enhancement (uses a credit)
      { effect: "improve:outdoor:40" },  // auto color/exposure improve
      { effect: "sharpen:80" },          // sharpening
      { quality: "auto:best" },          // best quality compression
      { fetch_format: "jpg" },
    ],
    secure: true,
  });

  // 3. Download the enhanced image as buffer
  const downloadRes = await axios.get(enhancedUrl, {
    responseType: "arraybuffer",
    timeout: 30_000,
  });

  // 4. Clean up uploaded original (optional, saves storage)
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (_) {
    // Non-fatal — cleanup failure shouldn't fail the enhancement
  }

  return {
    imageBase64: Buffer.from(downloadRes.data).toString("base64"),
    mimeType:    "image/jpeg",
  };
}
