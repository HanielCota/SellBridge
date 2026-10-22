/** The home page as the server function returns it, for the client components. */
export type SupplierHomeData = Awaited<
  ReturnType<typeof import("./home.functions").getSupplierHomeFn>
>;
export type SupplierHomeOrderRow = SupplierHomeData["orders"]["accept"][number];
export type SupplierHomeCatalogFix = SupplierHomeData["catalog"][number];

/** One "Aviso da equipe" (a supplier flag) as the supplier's home receives it. */
export type SupplierHomeTeamNotice = Awaited<
  ReturnType<typeof import("./team-notices.functions").getTeamNoticesFn>
>[number];
