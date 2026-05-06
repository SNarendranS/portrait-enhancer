/**
 * Gemini — smart portrait enhancer with auto-defect detection.
 * Fixes oversaturation / blown-out highlights before beautification,
 * so office webcam photos (harsh ceiling lights, overexposed bg) are
 * handled correctly instead of being further saturated.
 */

const PROMPT = `You are a professional photo retouching AI. Before applying any enhancements, first analyse the image for these common defects and fix them intelligently:

STEP 1 — AUTO-CORRECT DEFECTS (apply only what is needed):
- Overexposure / blown-out highlights: recover ceiling lights, window glare, harsh specular reflections on skin. Bring highlight luminosity down so detail is visible.
- Oversaturation: if colours look unnaturally vivid or skin looks orange/red, reduce saturation to natural levels first.
- Colour cast (cool/warm): balance white point so skin tones read as natural.
- Background light noise: reduce distracting bright spots, halos, or blown ceiling/fluorescent fixtures in the background using localised tone-mapping.
- Lens flare / glare streaks: suppress without destroying background detail.

STEP 2 — PORTRAIT BEAUTIFICATION (subtle, realistic, preserve identity):
- Skin: smooth texture gently (keep pores visible), even out tone, reduce blemishes, dark circles, and forehead shine naturally.
- Eyes: sharpen iris detail, add slight brightness/catchlight clarity.
- Teeth: whiten naturally — no over-bright artificial white; just remove yellow cast.
- Eyebrows: lightly define without overdrawing.
- Hair: reduce frizz, add natural shine.

STEP 3 — CINEMATIC FINISH:
- Depth-of-field: subtly blur background to separate subject.
- Lighting: add soft, flattering portrait lighting while matching the original scene direction.
- Dynamic range: ensure shadows have detail and highlights are not clipped.
- Colour grade: muted, natural palette — not Instagram-filtered.
- Final output: high resolution, ultra-realistic, professional portrait quality.

IMPORTANT CONSTRAINTS:
- Do NOT change facial structure or identity.
- Do NOT over-smooth to a plastic/AI look.
- Do NOT oversaturate — the goal is natural, not vivid.
- If the original image is already well-exposed, skip Step 1 and go straight to Step 2.
- Output the enhanced image only, no text.`;

const ENDPOINTS = [
  { api: "v1beta", model: "gemini-2.0-flash-exp-image-generation" },
  { api: "v1beta", model: "gemini-2.5-flash-preview-05-20" },
  { api: "v1beta", model: "gemini-2.0-flash-thinking-exp-01-21" },
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
    generationConfig: { responseModalities: ["IMAGE"] }
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
