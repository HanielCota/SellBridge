import { z } from "zod";
import { cepSchema } from "../domain/cep.ts";

export const updateRegionSchema = z.object({ cep: cepSchema });
export type UpdateRegionInput = z.input<typeof updateRegionSchema>;
