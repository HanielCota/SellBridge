import { useState } from "react";

/**
 * The option a control shows. A pick shows at once, while the page still loads its data; when
 * the source value catches up (or changes elsewhere, like the back button), it wins.
 */
export function useOptimisticChoice<TValue>(value: TValue) {
  const [picked, setPicked] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (!Object.is(value, lastValue)) {
    setLastValue(value);
    setPicked(value);
  }
  return { value: picked, choose: setPicked };
}
