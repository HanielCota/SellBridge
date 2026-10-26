import { createConnectorRegistry } from "@sellbridge/marketplaces";
import { environment } from "./environment.ts";
import { startWorker } from "./runtime.ts";

await startWorker(
  createConnectorRegistry({
    mercadoLivre: {
      clientId: environment.MERCADO_LIVRE_CLIENT_ID,
      clientSecret: environment.MERCADO_LIVRE_CLIENT_SECRET,
    },
  }),
);
