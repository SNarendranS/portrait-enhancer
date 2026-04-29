/**
 * Stability AI — stable-diffusion img2img
 * Free: 25 credits/month on free account (each image ≈ 1 credit)
 * Sign up: https://platform.stability.ai/account/keys
 *
 * Using low denoising_strength (0.3) to preserve identity while enhancing quality.
 */

import axios from "axios";
import FormData from "form-data";

export async function enhanceWithStability(imageBuffer, mimeType) {
  if (!process.env.STABILITY_API_KEY) throw new Error("STABILITY_API_KEY not set");

  const form = new FormData();
  form.append("init_image",         imageBuffer, { filename: "input.jpg", contentType: mimeType });
  form.append("init_image_mode",    "IMAGE_STRENGTH");
  form.append("image_strength",     "0.30"); // low = preserve identity, just enhance quality
  form.append("text_prompts[0][text]", "professional portrait photo, natural skin texture, soft cinematic lighting, sharp eyes, slight depth of field, high resolution, photorealistic, natural colors");
  form.append("text_prompts[0][weight]", "1");
  form.append("text_prompts[1][text]", "cartoon, painting, illustration, blurry, overexposed, artificial, plastic skin, heavy filter");
  form.append("text_prompts[1][weight]", "-1");
  form.append("cfg_scale",   "7");
  form.append("samples",     "1");
  form.append("steps",       "30");
  form.append("style_preset", "photographic");

  const res = await axios.post(
    "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image",
    form,
    {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
        Accept: "application/json",
      },
      timeout: 60_000,
    }
  );

  const artifact = res.data?.artifacts?.[0];
  if (!artifact?.base64) throw new Error("Stability returned no image");

  return {
    imageBase64: artifact.base64,
    mimeType: "image/png",
  };
}
