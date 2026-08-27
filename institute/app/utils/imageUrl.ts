// Guard for `question_image_ids` before it is rendered as an <img> under a
// question stem. The column holds one of three things: a real CDN URL
// (https://…), an EMPTY string, or a legacy BoardVitals path
// (\Images_BoardVitals\…). Only the first is renderable, so this returns true
// exclusively for http(s) URLs and the image block is skipped otherwise —
// leaving no empty box behind.
//
// Auto-imported by Nuxt (utils/), so templates can call isImageUrl(...) directly.
export const isImageUrl = (val?: string | null): boolean => {
  if (typeof val !== 'string') return false
  return /^https?:\/\/\S+/i.test(val.trim())
}
