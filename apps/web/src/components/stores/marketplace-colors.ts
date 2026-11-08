/**
 * Each marketplace's brand colors in one place: the logo tile and the name badge. The badge
 * carries text, so its background may be a deeper shade to keep the text readable (WCAG AA).
 */
export const MARKETPLACE_COLORS: Readonly<Record<string, { tile: string; badge: string }>> = {
  mercado_livre: { tile: "bg-[#ffe600]", badge: "bg-[#ffe600] text-[#2d3277]" },
  // White on the brand orange measures 3.66:1; the deeper orange measures 5.34:1.
  shopee: { tile: "bg-[#ee4d2d]", badge: "bg-[#c4381c] text-white" },
  tiktok_shop: {
    tile: "bg-black ring-1 ring-white/10",
    badge: "bg-black text-white dark:bg-white dark:text-black",
  },
};
