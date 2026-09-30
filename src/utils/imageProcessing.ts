/**
 * Browser-side image preparation for avatar/photo uploads. The backend accepts JPEG/PNG/WebP up to 300 KiB for account
 * avatars (storage policy `user_avatars_insert`), and the versioned object path must end in `.jpg`, so every image is
 * re-encoded as a square-cropped JPEG and stepped down in quality/size until it fits.
 */

export const AVATAR_MAX_BYTES = 300 * 1024

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file could not be read as an image.'))
    }
    img.src = url
  })
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

/** Center-crops to a square, scales down, and re-encodes as JPEG under `maxBytes` (quality then dimension step-down). */
export async function prepareSquareJpeg(file: File, maxBytes = AVATAR_MAX_BYTES, startSize = 768): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file (JPEG, PNG, or WebP).')
  const image = await loadImage(file)
  const side = Math.min(image.naturalWidth, image.naturalHeight)
  const sx = (image.naturalWidth - side) / 2
  const sy = (image.naturalHeight - side) / 2

  for (let size = Math.min(startSize, side); size >= 128; size = Math.floor(size * 0.75)) {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Your browser could not process that image.')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)
    ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size)
    for (let quality = 0.9; quality >= 0.5; quality -= 0.1) {
      const blob = await canvasToJpeg(canvas, quality)
      if (blob && blob.size <= maxBytes) return blob
    }
  }
  throw new Error('That image is too large to compress under 300 KB. Try a smaller photo.')
}
