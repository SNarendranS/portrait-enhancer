/**
 * Stability AI — v2beta upscale/enhance
 * The /edit/enhance endpoint needs a specific content-type and 404'd.
 * Using /upscale/conservative instead — purpose-built for photo enhancement.
 * Free: 25 credits/month.
 */

import axios    from "axios";
import FormData from "form-data";

export async function enhanceWithStability(imageBuffer, mimeType) {
  if (!process.env.STABILITY_API_KEY) throw new Error("STABILITY_API_KEY not set");

  // Resize to max 1MP before sending — Stability rejects large images on free tier
  let imgBuffer = imageBuffer;
  try {
    const { default: sharp } = await import("sharp");
    imgBuffer = await sharp(imageBuffer)
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch (_) { /* sharp optional */ }

  const form = new FormData();
  form.append("image",         imgBuffer, { filename: "input.jpg", contentType: "image/jpeg" });
  form.append("prompt",        "professional portrait photo, enhanced skin, natural lighting, sharp eyes, photorealistic");
  form.append("negative_prompt", "blurry, overexposed, cartoon, different person, changed face");
  form.append("creativity",    "0.2");   // 0–1: low = preserve image, just enhance quality
  form.append("output_format", "jpeg");

  const res = await axios.post(
    "https://api.stability.ai/v2beta/stable-image/upscale/conservative",
    form,
    {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
        Accept: "image/*",
      },
      responseType: "arraybuffer",
      timeout: 120_000,
    }
  );

  if (res.status !== 200) {
    const msg = Buffer.from(res.data).toString("utf8").slice(0, 300);
    throw new Error(`Stability ${res.status}: ${msg}`);
  }

  return {
    imageBase64: Buffer.from(res.data).toString("base64"),
    mimeType:    "image/jpeg",
  };
}
