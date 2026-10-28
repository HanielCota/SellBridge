/** The "Desempenho" page as the server functions return it, for the client components. */
export type SupplierPerformanceData = Awaited<
  ReturnType<typeof import("./performance.functions").getSupplierPerformanceFn>
>;
export type PerformanceOrder = Awaited<
  ReturnType<typeof import("./performance.functions").getPerformanceOrdersFn>
>[number];
