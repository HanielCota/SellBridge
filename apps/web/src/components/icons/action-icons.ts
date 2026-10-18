import { HeadsetIcon, type Icon } from "@phosphor-icons/react";

/**
 * One icon per FUNCTION, shared by every area (docs/PLANO-UX-ICONES.md): the same function always
 * gets the same icon and tooltip, and two functions never share an icon. Icons are imported one by
 * one so the bundle only carries the ones listed here. Texts follow docs/GLOSSARIO-UX.md.
 */
export interface ActionIcon {
  readonly icon: Icon;
  /** Tooltip text; absent where the visible label already says everything. */
  readonly hint?: string;
}

export const ACTION_ICONS = {
  support: {
    icon: HeadsetIcon,
    hint: "Fale com a equipe do SellBridge ou acompanhe seus chamados",
  },
} as const satisfies Record<string, ActionIcon>;

export type ActionIconName = keyof typeof ACTION_ICONS;
