/**
 * Gemini — uses v1alpha API which has broader model availability than v1beta
 * Also adds a longer timeout since the model is slow on first inference
 */

const PROMPT = `Enhance this uploaded image while preserving the original identity and natural look.
Improve facial aesthetics with subtle, realistic adjustments:
- natural skin smoothing (retain pores and texture, avoid plastic look)
- even skin tone with a soft healthy glow
- reduce blemishes, dark spots, and under-eye shadows naturally
- enhance eyes slightly (sharpness, brightness, catchlight clarity)
- whiten teeth naturally (no over-bright artificial white)
- improve facial lighting and symmetry subtly
Hair:
- refine hair texture, reduce frizz, enhance natural shine
Lighting & Color:
- correct white balance, improve exposure and dynamic range
- add soft cinematic lighting, natural color grading (not oversaturated)
- fix overexposed areas, recover highlight detail
Background:
- subtly blur background (depth-of-field effect)
- enhance background colors and lighting consistency
Overall:
- high resolution, ultra-detailed, realistic professional portrait finish
- no artificial filters, no over-smoothing, no exaggerated features
- maintain original facial structure and likeness exactly`;

// Try v1alpha first — has wider model support than v1beta for experimental models
const ENDPOINTS = [
  // gemini-2.0-flash-exp supports image generation on free tier
  { api: "v1beta",  model: "gemini-2.0-flash-exp" },
  { api: "v1alpha", model: "gemini-2.0-flash-exp" },
  // Preview image generation models (may need paid tier)
  { api: "v1beta",  model: "gemini-2.0-flash-preview-image-generation" },
  { api: "v1alpha", model: "gemini-2.0-flash-preview-image-generation" },
  // 2.5 flash preview (paid tier only)
  { api: "v1beta",  model: "gemini-2.5-flash-preview-05-20" },
  { api: "v1alpha", model: "gemini-2.5-flash-preview-05-20" },
];

async function tryEndpoint({ api, model }, imageBase64, mimeType, apiKey) {
  const url = `https://generativelanguage.googleapis.com/${api}/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{
      role: "user",
      parts: [
        { inline_data: { mime_type: mimeType || "image/jpeg", data: imageBase64 } },
        { text: PROMPT },
      ],
    }],
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000); // 90s per attempt

  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message || `HTTP ${res.status}`;
      // 404/400 = model not available on this API version
      // 429 = quota exceeded for this model
      // Both cases: try the next endpoint
      const isTryNext = res.status === 404 || res.status === 400 || res.status === 429;
      throw Object.assign(new Error(msg), { isTryNext });
    }

    const data  = await res.json();
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const img   = parts.find(p => p.inline_data?.mime_type?.startsWith("image/"));
    if (!img) {
      const txt = parts.find(p => p.text)?.text?.slice(0, 200) ?? "no text";
      throw new Error(`No image in response: ${txt}`);
    }
    return { imageBase64: img.inline_data.data, mimeType: img.inline_data.mime_type };
  } finally {
    clearTimeout(timer);
  }
}

export async function enhanceWithGemini(imageBuffer, mimeType) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  const b64    = imageBuffer.toString("base64");
  const errors = [];

  for (const ep of ENDPOINTS) {
    try {
      console.log(`  [gemini] trying ${ep.api}/${ep.model}...`);
      const result = await tryEndpoint(ep, b64, mimeType, process.env.GEMINI_API_KEY);
      console.log(`  [gemini] ✓ ${ep.model} succeeded`);
      return result;
    } catch (err) {
      const msg = err.message.slice(0, 100);
      console.log(`  [gemini] ✗ ${ep.model}: ${msg}`);
      errors.push(`${ep.api}/${ep.model}: ${err.message}`);
      if (!err.isTryNext) break;
    }
  }

  throw new Error(`All Gemini endpoints failed:\n${errors.join("\n")}`);
}
