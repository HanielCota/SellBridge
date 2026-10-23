import { Link } from "@tanstack/react-router";
import { MapPinIcon } from "@phosphor-icons/react";
import { buttonVariants } from "@/components/ui/button";

/** From a parcel with a code to the Rastreio tab, opened on its order. */
export function TrackParcelLink({ orderId }: { orderId: string }) {
  return (
    <Link
      to="/pedidos"
      search={{ view: "tracking", trackOrder: orderId }}
      className={buttonVariants({ variant: "outline" })}
    >
      <MapPinIcon aria-hidden="true" />
      Acompanhar rastreio
    </Link>
  );
}
