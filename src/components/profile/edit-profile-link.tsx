import { ListRow } from "@/components/ui/list-row";

/**
 * F7's entire footprint on `/profile`.
 *
 * A server component and a single row, so F9 can drop it wherever its own layout
 * wants without importing anything of F7's data. F9 decides *where* it sits; F7
 * decides what it says and where it goes.
 */
export function EditProfileLink() {
  return (
    <ListRow
      href="/profile/edit"
      title="Your answers"
      trailing={<span className="text-ink-3">→</span>}
    />
  );
}
