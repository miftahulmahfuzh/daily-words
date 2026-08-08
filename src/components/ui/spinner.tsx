import { cn } from "@/lib/ui/cn";

/** The only indeterminate indicator in the app. `currentColor`, so it inherits. */
export function Spinner({
  size = 16,
  className,
}: {
  size?: 16 | 20 | 24;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label="Working"
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent",
        className,
      )}
      style={{ width: size, height: size, animationDuration: "800ms" }}
    />
  );
}
