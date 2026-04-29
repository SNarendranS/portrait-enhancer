/**
 * Stability AI — stable-image/generate/sd3 (img2img style transfer)
 * Free: 25 credits/month on free account
 * Sign up: https://platform.stability.ai/account/keys
 *
 * The v1 /image-to-image endpoint was deprecated. This uses the correct
 * v2beta /stable-image/control/style endpoint which is widely available,
 * or falls back to /stable-image/generate/core for simple enhancement.
 */

import axios from "axios";
import FormData from "form-data";

const ENHANCE_PROMPT =
  "professional portrait photography, natural skin texture, soft cinematic lighting, " +
  "sharp eyes, slight depth of field, high resolution, photorealistic, natural colors, " +
  "beautiful skin, professional headshot";

const NEGATIVE_PROMPT =
  "cartoon, painting, illustration, blurry, overexposed, artificial, plastic skin, " +
  "heavy makeup, filter, noise, grain, oversaturated";

export async function enhanceWithStability(imageBuffer, mimeType) {
  if (!process.env.STABILITY_API_KEY) throw new Error("STABILITY_API_KEY not set");

  // Try the structure endpoint first (image-to-image, preserves subject)
  try {
    return await tryStructureEndpoint(imageBuffer, mimeType);
  } catch (err) {
    // If structure endpoint not available (credits/plan), try style
    if (err.response?.status === 403 || err.response?.status === 404) {
      return await tryStyleEndpoint(imageBuffer, mimeType);
    }
    throw err;
  }
}

async function tryStructureEndpoint(imageBuffer, mimeType) {
  const form = new FormData();
  form.append("image",          imageBuffer, { filename: "input.jpg", contentType: mimeType || "image/jpeg" });
  form.append("prompt",         ENHANCE_PROMPT);
  form.append("negative_prompt", NEGATIVE_PROMPT);
  form.append("control_strength", "0.7");  // 0=ignore structure, 1=rigid — 0.7 preserves face well
  form.append("output_format",  "jpeg");

  const res = await axios.post(
    "https://api.stability.ai/v2beta/stable-image/control/structure",
    form,
    {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
        Accept: "image/*",
      },
      responseType: "arraybuffer",
      timeout: 90_000,
    }
  );

  return {
    imageBase64: Buffer.from(res.data).toString("base64"),
    mimeType: "image/jpeg",
  };
}

async function tryStyleEndpoint(imageBuffer, mimeType) {
  const form = new FormData();
  form.append("image",          imageBuffer, { filename: "input.jpg", contentType: mimeType || "image/jpeg" });
  form.append("prompt",         ENHANCE_PROMPT);
  form.append("negative_prompt", NEGATIVE_PROMPT);
  form.append("fidelity",       "0.85");  // how closely to follow the style image
  form.append("output_format",  "jpeg");

  const res = await axios.post(
    "https://api.stability.ai/v2beta/stable-image/control/style",
    form,
    {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
        Accept: "image/*",
      },
      responseType: "arraybuffer",
      timeout: 90_000,
    }
  );

  return {
    imageBase64: Buffer.from(res.data).toString("base64"),
    mimeType: "image/jpeg",
  };
}