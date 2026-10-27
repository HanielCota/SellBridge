import { describe, expect, it } from "vitest";
import { coversAnyControl } from "./launcher-clearance";

// The expanded bubble on a 599px phone: 16px from the right, 16px from the bottom.
const bubble = { left: 363, top: 842, right: 583, bottom: 898 };

describe("coversAnyControl", () => {
  it("finds a page button under the expanded bubble", () => {
    const nextPage = { left: 300, top: 850, right: 390, bottom: 890 };
    expect(coversAnyControl(bubble, [nextPage])).toBe(true);
  });

  it("leaves the label up when the controls stay clear of it", () => {
    const above = { left: 400, top: 700, right: 580, bottom: 740 };
    const beside = { left: 20, top: 850, right: 340, bottom: 890 };
    expect(coversAnyControl(bubble, [above, beside])).toBe(false);
  });

  it("does not count a control that only touches the bubble's edge", () => {
    const touching = { left: 300, top: 850, right: 363, bottom: 890 };
    expect(coversAnyControl(bubble, [touching])).toBe(false);
  });

  it("ignores controls with no size, such as hidden ones", () => {
    const hidden = { left: 400, top: 860, right: 400, bottom: 860 };
    expect(coversAnyControl(bubble, [hidden])).toBe(false);
  });
});
