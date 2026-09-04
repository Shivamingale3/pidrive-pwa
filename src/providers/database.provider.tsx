import DatabaseContext from "@/contexts/database.context";
import { AppDatabase } from "@/database";
import { useEffect, useState, type PropsWithChildren } from "react";

export function DatabaseProvider({ children }: PropsWithChildren) {
  const [database, setDatabase] = useState<AppDatabase | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    AppDatabase.create()
      .then((db) => {
        if (mounted) {
          setDatabase(db);
        }
      })
      .catch((err: unknown) => {
        if (mounted) {
          setError(
            err instanceof Error
              ? err
              : new Error("Failed to initialize database"),
          );
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (error) {
    throw error;
  }

  if (!database) {
    return null;
  }

  return (
    <DatabaseContext.Provider value={database}>
      {children}
    </DatabaseContext.Provider>
  );
}
