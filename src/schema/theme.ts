import { z } from "zod";

export const themeSchema = z.object({
  nome_azienda: z.string().min(1),
  logo_path: z.string().optional(),
  palette: z.object({
    primario: z.string(),
    secondario: z.string().optional(),
    testo: z.string().optional(),
    sfondo: z.string().optional(),
  }),
});

export type Theme = z.infer<typeof themeSchema>;
