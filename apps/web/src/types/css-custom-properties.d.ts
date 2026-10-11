import "react";

declare module "react" {
  /** CSS variables (`--step`, `--link-duration`) are valid inline styles, so they type-check as such. */
  interface CSSProperties {
    [customProperty: `--${string}`]: string | number | undefined;
  }
}
