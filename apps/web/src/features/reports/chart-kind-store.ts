import { useCallback, useSyncExternalStore } from "react";

interface ChartKindStoreConfig<Kind extends string> {
  /** localStorage key of this dashboard's saved chart. */
  storageKey: string;
  /** Window event that tells other charts of the page the default changed. */
  eventName: string;
  kinds: readonly Kind[];
  /** The chart every account sees until its owner picks another one as default. */
  factory: Kind;
}

/**
 * The chart a dashboard opens with, saved in this browser. The reseller dashboard and the supplier
 * home (item 38) each keep their own, since they offer different charts.
 */
export function createChartKindStore<Kind extends string>(config: ChartKindStoreConfig<Kind>) {
  const isKind = (value: unknown): value is Kind => config.kinds.some((kind) => kind === value);

  function subscribe(onChange: () => void): () => void {
    window.addEventListener(config.eventName, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(config.eventName, onChange);
      window.removeEventListener("storage", onChange);
    };
  }

  function getSnapshot(): Kind {
    try {
      const saved = localStorage.getItem(config.storageKey);
      return isKind(saved) ? saved : config.factory;
    } catch {
      // Storage may be unavailable (private mode); the dashboard opens with the factory chart.
      return config.factory;
    }
  }

  const getServerSnapshot = (): Kind => config.factory;

  function writeDefault(kind: Kind): void {
    if (kind === config.factory) {
      localStorage.removeItem(config.storageKey);
      return;
    }
    localStorage.setItem(config.storageKey, kind);
  }

  function saveDefault(kind: Kind): void {
    try {
      writeDefault(kind);
    } catch {
      // Storage may be unavailable (private mode); the choice still applies to this page.
    }
    window.dispatchEvent(new Event(config.eventName));
  }

  return function useDefaultKind(): {
    defaultKind: Kind;
    setDefaultKind: (kind: Kind) => void;
  } {
    const defaultKind = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    const setDefaultKind = useCallback((kind: Kind) => saveDefault(kind), []);
    return { defaultKind, setDefaultKind };
  };
}
