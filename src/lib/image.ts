import type { Attachment } from "../types";
import { uid } from "./chat";

const MAX_SIDE = 1568;

/** Downscale and re-encode an image so requests stay well under Groq's base64 size limit. */
export async function fileToAttachment(file: File): Promise<Attachment> {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image`);
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error(`Could not read ${file.name}`));
      i.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; // flatten transparency for JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return { id: uid(), name: file.name || "image", dataUrl: canvas.toDataURL("image/jpeg", 0.86) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
