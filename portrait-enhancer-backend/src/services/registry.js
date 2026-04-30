/**
 * services/registry.js
 *
 * Single source of truth for all enhancement services.
 * The backend sends this list to the frontend via GET /api/enhance/services
 * so the frontend never needs to hardcode service names or metadata.
 *
 * To add a new service later:
 *   1. Create a new service file in src/services/
 *   2. Add an entry here — the frontend picks it up automatically.
 */

import { enhanceWithGemini }     from "./gemini.js";
import { enhanceWithStability }  from "./stability.js";
import { enhanceWithCloudinary } from "./cloudinary.js";
import { enhanceWithGFPGAN }     from "./gfpgan.js";
import { enhanceWithOpenCV }     from "./opencv.js";
import { enhanceWithPicwish } from "./picwish.js";
import { enhanceWithRealESRGAN } from "./realesrgan.js";

/**
 * @typedef {Object} ServiceDefinition
 * @property {string}   id          — stable key used by frontend to select/deselect
 * @property {string}   name        — display name
 * @property {string}   tier        — short label shown in the pill (e.g. "1500/day")
 * @property {string}   type        — "cloud" | "local"
 * @property {string}   description — tooltip / info text
 * @property {Function} fn          — (imageBuffer, mimeType) => { imageBase64, mimeType }
 * @property {Function} isAvailable — () => boolean  (checked at startup and per-request)
 */
export const SERVICE_REGISTRY = [
  {
    id:          "gemini",
    name:        "Gemini 2.0 Flash",
    tier:        "1500/day",
    type:        "cloud",
    description: "Google AI image editing — free via AI Studio key",
    fn:          enhanceWithGemini,
    isAvailable: () => !!process.env.GEMINI_API_KEY,
  },
  {
    id:          "stability",
    name:        "Stability AI",
    tier:        "25/mo",
    type:        "cloud",
    description: "Stable Diffusion img2img — free 25 credits/month",
    fn:          enhanceWithStability,
    isAvailable: () => !!process.env.STABILITY_API_KEY,
  },
  {
    id:          "cloudinary",
    name:        "Cloudinary AI",
    tier:        "free tier",
    type:        "cloud",
    description: "Cloudinary AI transformations — generous free plan",
    fn:          enhanceWithCloudinary,
    isAvailable: () => !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
  },
  {
    id:          "gfpgan",
    name:        "GFPGAN",
    tier:        "local",
    type:        "local",
    description: "GFPGAN + Real-ESRGAN — local AI, self-hosted, fully free",
    fn:          enhanceWithGFPGAN,
    isAvailable: () => true,
  },
  {
    id:          "opencv",
    name:        "OpenCV",
    tier:        "local",
    type:        "local",
    description: "OpenCV + Pillow — rule-based, no models, always works",
    fn:          enhanceWithOpenCV,
    isAvailable: () => true,
  },
    {
    id:          "picwish",
    name:        "PicWish",
    tier:        "free tier",
    type:        "cloud",
    description: "api picwish",
    fn:          enhanceWithPicwish,
    isAvailable: () => true,
  },
    {
    id:          "realesrgan",
    name:        "Real ESRGAN",
    tier:        "local",
    type:        "local",
    description: "real ESRGAN, no models, always works",
    fn:          enhanceWithRealESRGAN,
    isAvailable: () => true,
  },
];

/** Map of id → ServiceDefinition for O(1) lookup */
export const SERVICE_MAP = Object.fromEntries(SERVICE_REGISTRY.map(s => [s.id, s]));