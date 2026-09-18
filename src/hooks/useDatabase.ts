import { useContext } from "react";

import type { AppDatabase } from "@/database";
import { DatabaseContext } from "@/contexts/database.context";

export function useDatabase(): AppDatabase {
  const database = useContext(DatabaseContext);

  if (!database) {
    throw new Error("useDatabase must be used inside DatabaseProvider");
  }

  return database;
}
