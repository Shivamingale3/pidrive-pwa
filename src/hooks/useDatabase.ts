import type { AppDatabase } from "@/database/app-database";
import DatabaseContext from "@/contexts/database.context";
import { useContext } from "react";

export function useDatabase(): AppDatabase {
  const database = useContext(DatabaseContext);

  if (!database) {
    throw new Error("useDatabase must be used inside DatabaseProvider");
  }

  return database;
}
