import { createFileRoute } from "@tanstack/react-router";
import { BuyerTrackingPage } from "@/components/tracking/buyer-tracking-page";

export const Route = createFileRoute("/rastreio/$token")({
  head: () => ({
    meta: [
      { title: "Rastreio do pedido" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: BuyerTrackingRoute,
});

function BuyerTrackingRoute() {
  const { token } = Route.useParams();
  return <BuyerTrackingPage token={token} />;
}
