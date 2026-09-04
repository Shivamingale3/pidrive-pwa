import z from "zod";

export const noteValidationSchema = z.object({
  id: z.string().nonoptional(),
  title: z.string().nonoptional(),
  content: z.string().nonoptional(),
  createdAt: z.iso.datetime().nonoptional(),
  updatedAt: z.iso.datetime().nonoptional(),
  deletedAt: z.iso.datetime().nonoptional().default(null),
});
