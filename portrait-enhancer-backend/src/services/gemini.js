/**
 * Gemini 2.0 Flash — imagen edit
 * Free: 1500 requests/day via Google AI Studio key (no billing required)
 * Docs: https://ai.google.dev/gemini-api/docs/image-generation
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

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

export async function enhanceWithGemini(imageBuffer, mimeType) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  // Use gemini-2.0-flash-exp which supports image generation/editing
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp-image-generation" });

  const imagePart = {
    inlineData: {
      data: imageBuffer.toString("base64"),
      mimeType: mimeType || "image/jpeg",
    },
  };

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [imagePart, { text: PROMPT }] }],
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
  });

  const response = result.response;
  const parts    = response.candidates?.[0]?.content?.parts ?? [];

  // Find the image part in response
  const imgPart = parts.find((p) => p.inlineData?.mimeType?.startsWith("image/"));
  if (!imgPart) {
    const textPart = parts.find((p) => p.text);
    throw new Error(`Gemini returned no image. Text: ${textPart?.text?.slice(0, 100) ?? "none"}`);
  }

  return {
    imageBase64: imgPart.inlineData.data,
    mimeType:    imgPart.inlineData.mimeType,
  };
}
