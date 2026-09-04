import type { RxCollection } from "rxdb";
import type { Note } from "./notes.types";

export type AppDatabaseCollections = {
  notes: RxCollection<Note>;
};
