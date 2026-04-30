/**
 * Stability AI — v2beta stable-image img2img (identity-preserving)
 * Free: 25 credits/month on free account
 * Sign up: https://platform.stability.ai/account/keys
 *
 * Uses /v2beta/stable-image/generate/sd3 with mode=image-to-image.
 * strength controls how much to change: 0.0 = identical, 1.0 = ignore input.
 * 0.35 gives natural enhancement while keeping the face.
 */

import axios from "axios";
import FormData from "form-data";

const ENHANCE_PROMPT =
  "professional portrait photography, natural skin texture, soft cinematic lighting, " +
  "sharp eyes, slight depth of field, high resolution, photorealistic, natural colors, " +
  "beautiful skin, professional headshot, same person, same face";

const NEGATIVE_PROMPT =
  "cartoon, painting, illustration, blurry, overexposed, artificial, plastic skin, " +
  "heavy makeup, filter, noise, grain, oversaturated, different person";

export async function enhanceWithStability(imageBuffer, mimeType) {
  if (!process.env.STABILITY_API_KEY) throw new Error("STABILITY_API_KEY not set");

  // Primary: SD3 img2img — preserves identity well
  try {
    return await trySd3Img2Img(imageBuffer, mimeType);
  } catch (err) {
    // Fallback: structure control if SD3 fails (credits/plan issue)
    if (err.response?.status === 403 || err.response?.status === 404 || err.response?.status === 402) {
      console.warn("  [stability] SD3 unavailable, trying structure endpoint...");
      return await tryStructureEndpoint(imageBuffer, mimeType);
    }
    // Log full error body for debugging
    if (err.response?.data) {
      const body = Buffer.isBuffer(err.response.data)
        ? err.response.data.toString("utf8")
        : JSON.stringify(err.response.data);
      throw new Error(`Stability ${err.response.status}: ${body.slice(0, 300)}`);
    }
    throw err;
  }
}

/**
 * SD3 image-to-image — best for identity preservation on free tier.
 * strength=0.35 means "keep 65% of original, change 35%"
 */
async function trySd3Img2Img(imageBuffer, mimeType) {
  const form = new FormData();
  form.append("image", imageBuffer, {
    filename: "input.jpg",
    contentType: mimeType || "image/jpeg",
  });
  form.append("prompt", ENHANCE_PROMPT);
  form.append("negative_prompt", NEGATIVE_PROMPT);
  form.append("mode", "image-to-image");
  form.append("strength", "0.35");      // 0=identical → 1=ignore. 0.35 = subtle enhancement
  form.append("model", "sd3-large-turbo"); // fastest, 1 credit each
  form.append("output_format", "jpeg");

  const res = await axios.post(
    "https://api.stability.ai/v2beta/stable-image/generate/sd3",
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

/**
 * Fallback: structure control endpoint.
 * Preserves edges/composition but still generates a new face — less ideal.
 */
async function tryStructureEndpoint(imageBuffer, mimeType) {
  const form = new FormData();
  form.append("image", imageBuffer, {
    filename: "input.jpg",
    contentType: mimeType || "image/jpeg",
  });
  form.append("prompt", ENHANCE_PROMPT);
  form.append("negative_prompt", NEGATIVE_PROMPT);
  form.append("control_strength", "0.8"); // high = more faithful to structure
  form.append("output_format", "jpeg");

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