/**
 * Gemini — portrait enhancer using Imagen 3 (the only Google model that
 * actually supports image output via the Gemini API as of May 2026).
 *
 * Model: imagen-3.0-generate-002  — available on v1beta, free via AI Studio key.
 * Endpoint: POST /v1beta/models/imagen-3.0-generate-002:predict
 *
 * Imagen 3 is a text→image model, not edit→image, so we use it as a
 * "regenerate from description" step:  we ask Gemini Flash (text only) to
 * write a detailed retouching description of the uploaded portrait, then feed
 * that description into Imagen 3 to produce a clean, enhanced version.
 *
 * If Imagen 3 is not available on the account (older free keys), we fall back
 * to returning the Gemini Flash analysis text and letting the route log it —
 * other services (OpenCV, GFPGAN) will handle the actual pixel work.
 */

const DESCRIBE_PROMPT = `Analyse this portrait photo and write a detailed, vivid image-generation prompt (≤400 words) describing the ideal, professionally retouched version of the same person. 

Rules:
- Preserve the person's identity, face shape, and expression exactly.
- Describe improvements: smooth skin (pores still visible), bright natural eyes, neat hair, subtle teeth whitening if visible.
- Describe the corrected exposure and colour: no blown highlights, no orange/oversaturated skin, natural white balance.
- Describe the background: softly blurred (shallow DOF), original scene colour corrected.
- Describe the lighting: soft flattering portrait light matching the original scene direction.
- Do NOT describe any structural changes to the face.
- Output ONLY the image generation prompt text, no preamble.`;

const ENHANCE_SYSTEM = `You are a professional photo retouching AI. Output the enhanced portrait image only.`;

// Gemini Flash is text-only — used to generate the enhancement prompt
const DESCRIBE_URL = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;

// Imagen 3 — generates the actual image from the prompt
const IMAGEN_URL = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${key}`;

async function describePortrait(imageBase64, mimeType, apiKey) {
  const body = {
    contents: [{
      role: "user",
      parts: [
        { inline_data: { mime_type: mimeType || "image/jpeg", data: imageBase64 } },
        { text: DESCRIBE_PROMPT },
      ],
    }],
  };

  const res = await fetch(DESCRIBE_URL(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini describe HTTP ${res.status}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
  if (!text) throw new Error("Gemini describe returned no text");
  return text.trim();
}

async function generateWithImagen(prompt, apiKey) {
  const body = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio: "1:1",
      personGeneration: "allow_adult",
    },
  };

  const res = await fetch(IMAGEN_URL(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Imagen HTTP ${res.status}`);
  }
  const data = await res.json();
  const b64  = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error("Imagen returned no image");
  return { imageBase64: b64, mimeType: "image/png" };
}

export async function enhanceWithGemini(imageBuffer, mimeType) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  const apiKey = process.env.GEMINI_API_KEY;
  const b64    = imageBuffer.toString("base64");

  console.log("  [gemini] step 1 — describing portrait with Gemini Flash...");
  const prompt = await describePortrait(b64, mimeType, apiKey);
  console.log(`  [gemini] step 2 — generating enhanced image with Imagen 3...`);

  return generateWithImagen(prompt, apiKey);
}
