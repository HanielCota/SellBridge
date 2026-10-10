import { cn } from "@/lib/utils";
import { useState } from "react";
import { initials } from "./user-menu";

/** Profile photo, or the initials on the brand color when there is none (or it fails to load). */
export function UserAvatar({
  name,
  image,
  className,
}: {
  name: string;
  image: string | null;
  className?: string;
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const showImage = image !== null && image !== failedImage;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand text-sm font-semibold text-primary-foreground",
        className,
      )}
    >
      {showImage ? (
        <img
          src={image}
          alt=""
          className="size-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setFailedImage(image)}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
