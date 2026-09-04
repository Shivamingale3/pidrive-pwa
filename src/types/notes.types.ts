import type { noteValidationSchema } from "@/validation/note.validation";
import type z from "zod";

export type Note = z.infer<typeof noteValidationSchema>;
export type CreateNote = Omit<
  Note,
  "id" | "createdAt" | "updatedAt" | "deletedAt"
>;
export type UpdateNote = Partial<CreateNote>;
