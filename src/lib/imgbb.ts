import { supabase } from "@/integrations/supabase/client";

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

type UploadResponse = { url: string; deleteUrl: string | null };

async function reduzirImagem(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap === "undefined") return file;

  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));
  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
}

export async function uploadVistoriaImgBB(file: File, nome: string): Promise<UploadResponse> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sua sessão expirou. Entre novamente para enviar fotos.");

  const imagem = await reduzirImagem(file);
  const form = new FormData();
  form.append("image", imagem);
  form.append("name", `${nome}-${Date.now()}`.replace(/[^a-zA-Z0-9-_]/g, "-"));

  const response = await fetch("/api/upload-imgbb", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const result = (await response.json().catch(() => ({}))) as {
    error?: string;
    url?: string;
    deleteUrl?: string | null;
  };
  if (!response.ok || !result.url) {
    throw new Error(result.error || "Não foi possível publicar a foto no ImgBB.");
  }
  return { url: result.url, deleteUrl: result.deleteUrl ?? null };
}
