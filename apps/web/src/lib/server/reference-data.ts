import { listAdminCategories } from "@sellbridge/database/repositories";
import { createAsyncCache } from "./async-cache";
import { database } from "./database";

/** Global taxonomy only. Products, prices, stock and access checks stay outside this cache. */
const readCategories = createAsyncCache({
  load: async (_key: "categories") => listAdminCategories(database),
  maxEntries: 1,
  ttlMilliseconds: 5 * 60_000,
});

export function loadProductCategories() {
  return readCategories("categories");
}
