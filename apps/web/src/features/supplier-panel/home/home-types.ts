/** The home page as the server function returns it, for the client components. */
export type SupplierHomeData = Awaited<
  ReturnType<typeof import("./home.functions").getSupplierHomeFn>
>;
export type SupplierHomeOrderRow = SupplierHomeData["orders"]["accept"][number];
export type SupplierHomeCatalogFix = SupplierHomeData["catalog"][number];
