import type { RxJsonSchema } from "rxdb";
import type { Note } from "@/types/notes.types";

export const noteSchema: RxJsonSchema<Note> = {
  title: "notes",
  version: 0,
  primaryKey: "id",
  type: "object",

  properties: {
    id: {
      type: "string",
    },
    title: {
      type: "string",
    },
    content: {
      type: "string",
    },
    createdAt: {
      type: "string",
      format: "date-time",
    },
    updatedAt: {
      type: "string",
      format: "date-time",
    },
    deletedAt: {
      type: "string",
      format: "date-time",
    },
  },
  required: ["id", "title", "content", "createdAt", "updatedAt"],

  indexes: ["updatedAt", "title"],
};
