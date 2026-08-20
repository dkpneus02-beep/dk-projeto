export type VistoriaFoto = {
  url: string;
  deleteUrl: string | null;
};

export function normalizarFotos(value: unknown): VistoriaFoto[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): VistoriaFoto | null => {
      if (typeof item === "string" && item.trim()) {
        return { url: item, deleteUrl: null };
      }
      if (item && typeof item === "object" && "url" in item) {
        const url = (item as { url?: unknown }).url;
        if (typeof url === "string" && url.trim()) {
          const deleteUrl = (item as { deleteUrl?: unknown }).deleteUrl;
          return {
            url,
            deleteUrl: typeof deleteUrl === "string" && deleteUrl.trim() ? deleteUrl : null,
          };
        }
      }
      return null;
    })
    .filter((item): item is VistoriaFoto => item !== null);
}
