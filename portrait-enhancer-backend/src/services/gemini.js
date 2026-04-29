/**
 * Gemini 2.0 Flash — image editing via Imagen
 * Free: 1500 requests/day via Google AI Studio key (no billing required)
 * Docs: https://ai.google.dev/gemini-api/docs/image-generation
 *
 * Model renamed: gemini-2.0-flash-exp-image-generation is now
 * gemini-2.0-flash-preview-image-generation (or use gemini-2.0-flash-exp
 * with responseModalities IMAGE).
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const PROMPT = `Enhance this portrait photo while preserving the original identity and natural look.
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
- correct white balance
- improve exposure and dynamic range
- add soft cinematic lighting
- natural color grading (not oversaturated)
Background:
- clean up distractions
- subtly blur or depth-of-field effect
- enhance background colors and lighting consistency
Overall:
- high resolution, ultra-detailed
- realistic, professional portrait finish
- no artificial filters, no over-smoothing, no exaggerated features
- maintain original facial structure and likeness exactly`;

// Models to try in order (Google renames these periodically)
const CANDIDATE_MODELS = [
  "gemini-2.0-flash-preview-image-generation",
  "gemini-2.0-flash-exp-image-generation",
  "gemini-2.0-flash-exp",
];

export async function enhanceWithGemini(imageBuffer, mimeType) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  const imagePart = {
    inlineData: {
      data: imageBuffer.toString("base64"),
      mimeType: mimeType || "image/jpeg",
    },
  };

  let lastError;
  for (const modelName of CANDIDATE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [imagePart, { text: PROMPT }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      });

      const response = result.response;
      const parts    = response.candidates?.[0]?.content?.parts ?? [];

      const imgPart = parts.find((p) => p.inlineData?.mimeType?.startsWith("image/"));
      if (!imgPart) {
        const textPart = parts.find((p) => p.text);
        throw new Error(`No image in response. Text: ${textPart?.text?.slice(0, 100) ?? "none"}`);
      }

      return {
        imageBase64: imgPart.inlineData.data,
        mimeType:    imgPart.inlineData.mimeType,
      };
    } catch (err) {
      lastError = err;
      // Only continue to next model if it's a 404/not-found error
      if (!err.message?.includes("404") && !err.message?.includes("not found")) {
        throw err;
      }
    }
  }

  throw lastError ?? new Error("All Gemini model variants failed");
}