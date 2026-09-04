import { createRxDatabase, type RxDatabase } from "rxdb";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";

import type { Note } from "@/types/notes.types";
import { noteSchema } from "./schemas/Note";

export type AppDatabaseCollections = {
  notes: Note;
};

export type AppDatabase = RxDatabase<AppDatabaseCollections>;

let databasePromise: Promise<AppDatabase> | null = null;

export const getDatabase = (): Promise<AppDatabase> => {
  if (!databasePromise) {
    databasePromise = createDatabase();
  }

  return databasePromise;
};

const createDatabase = async (): Promise<AppDatabase> => {
  const database = await createRxDatabase<AppDatabaseCollections>({
    name: "vault",
    storage: getRxStorageDexie(),
  });

  await database.addCollections({
    notes: {
      schema: noteSchema,
    },
  });

  return database;
};
