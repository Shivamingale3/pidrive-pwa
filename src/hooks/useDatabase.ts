import { useContext } from "react";

import { AppDatabase } from "@/database";
import DatabaseContext from "@/contexts/database.context";
function useDatabase(): AppDatabase {
  const database = useContext(DatabaseContext);

  if (!database) {
    throw new Error("useDatabase must be used inside DatabaseProvider");
  }

  return database;
}
export default useDatabase;
