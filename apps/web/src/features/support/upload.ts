import { z } from "zod";

const apiErrorSchema = z.object({ error: z.string() });

/** Sends a multipart form to an API route and returns the JSON body or a readable error. */
export async function postMultipart(url: string, formData: FormData): Promise<unknown> {
  const response = await fetch(url, { method: "POST", body: formData });
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) {
    return body;
  }
  const parsed = apiErrorSchema.safeParse(body);
  throw new Error(parsed.success ? parsed.data.error : "Não foi possível enviar. Tente novamente.");
}
