import { createFileRoute, Outlet } from "@tanstack/react-router";

/** Suppliers are open to every reseller: any reseller sells any supplier in Brazil. */
export const Route = createFileRoute("/_app/fornecedores")({
  component: Outlet,
});
