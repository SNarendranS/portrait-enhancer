/**
 * PicWish AI — portrait enhancement API
 * Free: 3 credits/day on free account (no billing needed)
 * Sign up: https://picwish.com → API → get key
 *
 * Base URL:  https://techhk.aoscdn.com
 *
 * PicWish has two relevant endpoints — we try the newer one first:
 *   v2  POST /api/tasks/visual/quality      (portrait quality enhancement)
 *   v1  POST /api/tasks/visual/clarity      (older, may 404 on some keys)
 *
 * State codes: 1 = queued, 2 = processing, 4 = done, -1 = error
 */

import axios    from "axios";
import FormData from "form-data";

const BASE = "https://techhk.aoscdn.com";

// Try endpoint paths in order; return on first success
const UPLOAD_PATHS = [
  "/api/tasks/visual/quality",   // v2 — portrait enhancement
  "/api/tasks/visual/clarity",   // v1 — older alias
];

async function uploadTask(imageBuffer, mimeType, apiKey) {
  let lastErr;
  for (const path of UPLOAD_PATHS) {
    const form = new FormData();
    form.append("image_file", imageBuffer, {
      filename:    "photo.jpg",
      contentType: mimeType || "image/jpeg",
    });

    try {
      const res = await axios.post(`${BASE}${path}`, form, {
        headers: { ...form.getHeaders(), "X-API-KEY": apiKey },
        timeout: 30_000,
        validateStatus: null, // handle status manually
      });

      if (res.status === 404) {
        lastErr = new Error(`PicWish ${path} → 404`);
        continue; // try next path
      }
      if (res.data?.status !== 200) {
        throw new Error(`PicWish upload failed (${path}): ${JSON.stringify(res.data)}`);
      }

      const taskId = res.data?.data?.task_id;
      if (!taskId) throw new Error(`PicWish returned no task_id from ${path}`);
      console.log(`  [picwish] uploaded via ${path}, task_id=${taskId}`);
      return { taskId, pollPath: path };
    } catch (err) {
      if (err.message.includes("404")) { lastErr = err; continue; }
      throw err;
    }
  }
  throw lastErr ?? new Error("PicWish: all upload paths failed");
}

export async function enhanceWithPicwish(imageBuffer, mimeType) {
  if (!process.env.PICWISH_API_KEY) throw new Error("PICWISH_API_KEY not set");
  const apiKey = process.env.PICWISH_API_KEY;

  const { taskId, pollPath } = await uploadTask(imageBuffer, mimeType, apiKey);

  // Poll until state=4 (done) or state=-1 (error)
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 1500));

    const pollRes = await axios.get(`${BASE}${pollPath}/${taskId}`, {
      headers: { "X-API-KEY": apiKey },
      timeout: 15_000,
    });

    const state = pollRes.data?.data?.state;

    if (state === 4) {
      const imageUrl = pollRes.data?.data?.image;
      if (!imageUrl) throw new Error("PicWish: done but no image URL");
      const imgRes = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 30_000 });
      return { imageBase64: Buffer.from(imgRes.data).toString("base64"), mimeType: "image/jpeg" };
    }

    if (state === -1) {
      throw new Error(`PicWish task failed: ${JSON.stringify(pollRes.data)}`);
    }
    // 1=queued, 2=processing — keep polling
  }

  throw new Error("PicWish timed out after 60s");
}
