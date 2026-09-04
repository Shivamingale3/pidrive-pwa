import type { RxDatabase } from "rxdb";
import type { Note } from "./notes.types";

export type AppDatabaseCollections = {
  notes: Note;
};

export type AppDatabase = RxDatabase<AppDatabaseCollections>;
