import { createCn } from "cn/config";

/** Named sizes of the app type scale, defined as `--text-*` tokens in styles.css. */
export const TYPE_SCALE_SIZES = ["caption", "footnote", "subhead", "body"] as const;

/**
 * Class merger that knows the custom type scale. Without this, `text-subhead`
 * would be read as a text color and silently dropped next to `text-muted-foreground`.
 */
export const cn = createCn({
  extend: { classGroups: { "font-size": [{ text: [...TYPE_SCALE_SIZES] }] } },
});
