import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { getRawDatabase } from "./runtime";

export function getDb() {
  return drizzle(getRawDatabase(), { schema });
}
