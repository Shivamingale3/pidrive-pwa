import type { RxCollection } from "rxdb";
import type { Note } from "@/types/notes.types";

export type AppDatabaseCollections = {
  notes: RxCollection<Note>;
};
