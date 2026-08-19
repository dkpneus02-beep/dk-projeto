import { createFileRoute } from "@tanstack/react-router";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_BYTES = 32 * 1024 * 1024;

export const Route = createFileRoute("/api/upload-imgbb")({
  server: {
    middleware: [requireSupabaseAuth],
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.IMGBB_API_KEY;
        if (!apiKey) {
          return Response.json(
            { error: "O upload de fotos ainda não foi configurado no servidor." },
            { status: 503 },
          );
        }

        const form = await request.formData();
        const image = form.get("image");
        const name = form.get("name");

        if (!(image instanceof File)) {
          return Response.json({ error: "Nenhuma imagem foi enviada." }, { status: 400 });
        }
        if (!image.type.startsWith("image/")) {
          return Response.json({ error: "O arquivo enviado não é uma imagem." }, { status: 400 });
        }
        if (image.size > MAX_BYTES) {
          return Response.json(
            { error: "A imagem excede o limite de 32 MB do ImgBB." },
            { status: 413 },
          );
        }

        const payload = new FormData();
        payload.append("key", apiKey);
        payload.append("image", image, image.name || "vistoria.jpg");
        if (typeof name === "string" && name.trim()) payload.append("name", name.trim());

        const response = await fetch("https://api.imgbb.com/1/upload", {
          method: "POST",
          body: payload,
        });
        const result = (await response.json()) as {
          success?: boolean;
          data?: { display_url?: string; url?: string; delete_url?: string };
          error?: { message?: string };
        };

        if (!response.ok || !result.success || !(result.data?.display_url || result.data?.url)) {
          return Response.json(
            { error: result.error?.message || "O ImgBB recusou a imagem." },
            { status: 502 },
          );
        }

        return Response.json({
          url: result.data.display_url || result.data.url,
          deleteUrl: result.data.delete_url || null,
        });
      },
    },
  },
});
