import type { AppDatabase } from "@/database";
import { createContext } from "react";

export const DatabaseContext = createContext<AppDatabase | null>(null);
