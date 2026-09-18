import { useCallback, useEffect, useState } from "react";

import type { CreateNote, Note, UpdateNote } from "@/types/notes.types";
import { useDatabase } from "@/hooks/useDatabase";

export const useNotes = () => {
  const database = useDatabase();

  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    const subscription = database.notes.findAll$().subscribe(setNotes);

    return () => {
      subscription.unsubscribe();
    };
  }, [database]);

  const getById = useCallback(
    (id: string): Promise<Note | null> => {
      return database.notes.findById(id);
    },
    [database],
  );

  const create = useCallback(
    (data: CreateNote): Promise<Note> => {
      return database.notes.create(data);
    },
    [database],
  );

  const update = useCallback(
    (id: string, data: UpdateNote): Promise<Note> => {
      return database.notes.update(id, data);
    },
    [database],
  );

  const remove = useCallback(
    (id: string): Promise<void> => {
      return database.notes.delete(id);
    },
    [database],
  );

  return {
    notes,
    getById,
    create,
    update,
    remove,
  };
};
