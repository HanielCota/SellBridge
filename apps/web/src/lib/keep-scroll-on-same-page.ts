interface LocationCommit {
  readonly pathname: string;
  readonly resetScroll?: boolean | undefined;
}

/**
 * Keeps the scroll position when a navigation stays on the same page (only the search or the
 * hash changes: a period tab, a filter, a page of a list). Moving to another page still starts
 * at the top, and a navigation that sets `resetScroll` itself keeps its own choice.
 */
export function keepScrollOnSamePage<TCommit extends LocationCommit>(
  next: TCommit,
  currentPathname: string,
): TCommit {
  if (next.resetScroll !== undefined || next.pathname !== currentPathname) {
    return next;
  }
  return { ...next, resetScroll: false };
}
