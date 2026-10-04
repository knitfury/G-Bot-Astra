// Only internal entries observed in this session can be followed back.
export function internalRoute(value: string): boolean {
  if (
    !/^\/(workspace|settings|connections|providers|account|activity)(\/[^?#]*)?(\?[^#]*)?$/.test(
      value,
    )
  )
    return false;
  try {
    return (
      !decodeURIComponent(value.split("?")[0])
        .split("/")
        .some((s) => s === "." || s === ".." || s.includes("\\")) &&
      !value.includes("//")
    );
  } catch {
    return false;
  }
}
export class InternalNavigation {
  private entries: { id: string; route: string }[] = [];
  observe(
    route: string,
    existingId: unknown,
    newId: () => string,
  ): string | undefined {
    if (!internalRoute(route)) {
      this.entries = [];
      return;
    }
    const index = this.entries.findIndex(
      (e) => e.id === existingId && e.route === route,
    );
    if (index >= 0) {
      this.entries.splice(index + 1);
      return this.entries[index].id;
    }
    const entry = { id: newId(), route };
    this.entries.push(entry);
    this.entries = this.entries.slice(-100);
    return entry.id;
  }
  canBack(route: string, id: unknown) {
    return (
      this.entries.length > 1 &&
      this.entries.at(-1)?.route === route &&
      this.entries.at(-1)?.id === id
    );
  }
  fallback(route: string) {
    return route.startsWith("/connections/") ? "/connections" : "/workspace";
  }
}
