import {
  createContext,
  type PropsWithChildren,
  useEffect,
  useState,
} from "react";

import { AppDatabase } from "@/database/app-database";

const DatabaseContext = createContext<AppDatabase | null>(null);

export function DatabaseProvider({ children }: PropsWithChildren) {
  const [database, setDatabase] = useState<AppDatabase | null>(null);

  useEffect(() => {
    let mounted = true;

    AppDatabase.create().then((db) => {
      if (mounted) {
        setDatabase(db);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  if (!database) {
    return null;
  }

  return (
    <DatabaseContext.Provider value={database}>
      {children}
    </DatabaseContext.Provider>
  );
}

export default DatabaseContext;
