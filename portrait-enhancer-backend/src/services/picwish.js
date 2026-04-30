/**
 * PicWish AI — portrait enhancement API
 * Free: 3 credits/day on free account (no billing needed)
 * Sign up: https://picwish.com → API → get key
 *
 * Correct base URL: https://techhk.aoscdn.com  (NOT picwish.com)
 * Endpoint:  POST /api/tasks/visual/clarity   (portrait enhancement, async)
 * Poll:       GET /api/tasks/visual/clarity/{task_id}
 * Result field: data.image  (when data.state === 1)
 */

import axios    from "axios";
import FormData from "form-data";

const BASE = "https://techhk.aoscdn.com";

export async function enhanceWithPicwish(imageBuffer, mimeType) {
  if (!process.env.PICWISH_API_KEY) throw new Error("PICWISH_API_KEY not set");

  // Step 1: Upload image and create enhancement task
  const form = new FormData();
  form.append("image_file", imageBuffer, {
    filename:    "photo.jpg",
    contentType: mimeType || "image/jpeg",
  });
  form.append("sync", "0"); // async mode

  const uploadRes = await axios.post(
    `${BASE}/api/tasks/visual/clarity`,
    form,
    {
      headers: {
        ...form.getHeaders(),
        "X-API-KEY": process.env.PICWISH_API_KEY,
      },
      timeout: 30_000,
    }
  );

  if (uploadRes.data?.status !== 200) {
    throw new Error(`PicWish upload failed: ${JSON.stringify(uploadRes.data)}`);
  }

  const taskId = uploadRes.data?.data?.task_id;
  if (!taskId) throw new Error("PicWish returned no task_id");

  // Step 2: Poll for result (state=1 means done, state<0 means error)
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));

    const pollRes = await axios.get(
      `${BASE}/api/tasks/visual/clarity/${taskId}`,
      {
        headers: { "X-API-KEY": process.env.PICWISH_API_KEY },
        timeout: 10_000,
      }
    );

    const state = pollRes.data?.data?.state;

    if (state === 1) {
      const imageUrl = pollRes.data?.data?.image;
      if (!imageUrl) throw new Error("PicWish: no image URL in result");

      const imgRes = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 30_000 });
      return {
        imageBase64: Buffer.from(imgRes.data).toString("base64"),
        mimeType:    "image/jpeg",
      };
    }

    if (state < 0) {
      throw new Error(`PicWish task failed with state: ${state} — ${JSON.stringify(pollRes.data)}`);
    }
    // state 0 = pending, keep polling
  }

  throw new Error("PicWish timed out waiting for result (30s)");
}
