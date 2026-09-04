import type { AppDatabase } from "@/database";
import { createContext } from "react";

const DatabaseContext = createContext<AppDatabase | null>(null);

export default DatabaseContext;
