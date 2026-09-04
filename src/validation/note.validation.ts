import z from "zod";

export const noteValidationSchema = z.object({
  id: z.ulid().nonoptional(),
  title: z.string().nonoptional(),
  content: z.string().nonoptional(),
  createdAt: z.iso.datetime().nonoptional(),
  updatedAt: z.iso.datetime().nonoptional(),
  deletedAt: z.iso.datetime().optional().nullable(),
});
