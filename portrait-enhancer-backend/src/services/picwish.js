/**
 * PicWish AI — portrait enhancement API
 * Free: 3 credits/day on free account (no billing needed)
 * Sign up: https://picwish.com  → API → get key
 * Specifically trained for portrait enhancement: skin, lighting, sharpness.
 * Quality is close to Gemini for portraits.
 */

import axios    from "axios";
import FormData from "form-data";

export async function enhanceWithPicwish(imageBuffer, mimeType) {
  if (!process.env.PICWISH_API_KEY) throw new Error("PICWISH_API_KEY not set");

  // Step 1: Upload image and request enhancement
  const form = new FormData();
  form.append("image_file", imageBuffer, {
    filename:    "photo.jpg",
    contentType: mimeType || "image/jpeg",
  });

  const uploadRes = await axios.post(
    "https://www.picwish.com/api/v1/task/visual/enhance-face",
    form,
    {
      headers: {
        ...form.getHeaders(),
        "X-API-KEY": process.env.PICWISH_API_KEY,
      },
      timeout: 30_000,
    }
  );

  if (uploadRes.data?.status !== 100) {
    throw new Error(`PicWish upload failed: ${JSON.stringify(uploadRes.data)}`);
  }

  const taskId = uploadRes.data?.data?.task_id;
  if (!taskId) throw new Error("PicWish returned no task_id");

  // Step 2: Poll for result (usually ready in 3–8 seconds)
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 2000));

    const pollRes = await axios.get(
      `https://www.picwish.com/api/v1/task/${taskId}`,
      {
        headers: { "X-API-KEY": process.env.PICWISH_API_KEY },
        timeout: 10_000,
      }
    );

    const status = pollRes.data?.status;
    if (status === 200) {
      // Download the result image
      const imageUrl = pollRes.data?.data?.result_url;
      if (!imageUrl) throw new Error("PicWish: no result_url in response");

      const imgRes = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 30_000 });
      return {
        imageBase64: Buffer.from(imgRes.data).toString("base64"),
        mimeType:    "image/jpeg",
      };
    }

    if (status !== 100 && status !== 101) {
      throw new Error(`PicWish task failed with status: ${status}`);
    }
  }

  throw new Error("PicWish timed out waiting for result");
}
