import { z } from 'zod';

export const CloserLoginBodySchema = z.object({
  usuario: z.string().trim().min(1).max(128),
  contrasena: z.string().min(1).max(256),
});

export type CloserLoginBody = z.infer<typeof CloserLoginBodySchema>;
