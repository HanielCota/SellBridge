import { createElement as element } from "react";
import { createRoot } from "react-dom/client";
import { Hint, HintedText } from "../../src/components/ui/hint";
import { TooltipProvider } from "../../src/components/ui/tooltip";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Missing fixture root");
}

createRoot(root).render(
  element(TooltipProvider, {
    delayDuration: 300,
    children: element(
      "main",
      { style: { padding: 80, minHeight: 2000 } },
      element(HintedText, { label: "Term explanation", children: "Test term" }),
      element(Hint, {
        label: "Button explanation",
        children: element("button", { type: "button" }, "Test button"),
      }),
      element(Hint, {
        label: "Passive explanation",
        children: element("span", null, "Passive term"),
      }),
      element("button", { type: "button" }, "Outside"),
    ),
  }),
);
