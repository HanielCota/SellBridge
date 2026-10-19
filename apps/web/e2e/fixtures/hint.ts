import { createElement as element } from "react";
import { createRoot } from "react-dom/client";
import { Hint, HintedText } from "../../src/components/ui/hint";
import { TooltipProvider } from "../../src/components/ui/tooltip";
import { Checkbox } from "../../src/components/ui/checkbox";
import "./hint.css";

document.documentElement.classList.toggle(
  "dark",
  new URLSearchParams(window.location.search).get("theme") === "dark",
);

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
      element(
        "section",
        {
          "aria-label": "Checkbox composition",
          style: { display: "flex", gap: 40, marginTop: 40 },
        },
        element(Checkbox, { "aria-label": "Plain selection", defaultChecked: true }),
        element(Hint, {
          label: "Select for bulk actions",
          openOnTap: false,
          children: element(Checkbox, { "aria-label": "Hinted selection", defaultChecked: true }),
        }),
      ),
    ),
  }),
);
