import { createRxDatabase, type RxDatabase } from "rxdb";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";

import { NoteRepository } from "@/repositories/notes.repository";
import { noteSchema } from "./schemas/Note";
import type { AppDatabaseCollections } from "@/types/app.types";

export class AppDatabase {
  private constructor(
    public readonly database: RxDatabase<AppDatabaseCollections>,
    public readonly notes: NoteRepository,
  ) {}

  private static instance: Promise<AppDatabase> | null = null;

  static create(): Promise<AppDatabase> {
    if (!AppDatabase.instance) {
      AppDatabase.instance = AppDatabase.initialize();
    }

    return AppDatabase.instance;
  }

  private static async initialize(): Promise<AppDatabase> {
    const database = await createRxDatabase<AppDatabaseCollections>({
      name: "vault",
      storage: getRxStorageDexie(),
    });

    await database.addCollections({
      notes: {
        schema: noteSchema,
      },
    });

    const notes = new NoteRepository(database.notes);

    return new AppDatabase(database, notes);
  }
}
