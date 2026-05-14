/**
 * Placeholder for widget names that appear in role presets but don't yet
 * have a shipping component. Keeps the layout stable as new widgets
 * roll in without crashing the page or leaving an empty slot.
 */
export function PlaceholderWidget({
  name,
}: {
  name: string;
}): React.JSX.Element {
  return (
    <section className="rounded-lg border border-dashed border-border bg-card/50 p-4">
      <h2 className="text-lg font-semibold capitalize">
        {name.replace(/-/g, " ")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Not yet available. This widget is part of a future sprint.
      </p>
    </section>
  );
}
