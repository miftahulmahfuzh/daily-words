"use client";

import { useEffect } from "react";
import { Screen, ScreenBody } from "@/components/layout/screen";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * What /profile shows when the read fails.
 *
 * The alternative — rendering the page with zeroes in it — is the one failure
 * mode this screen must not have. A user with three years of cards would be
 * told, in the app's own confident numerals, that they have none. Better to say
 * plainly that the numbers could not be fetched.
 */
export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[F9] /profile failed to render", error);
  }, [error]);

  return (
    <Screen tabs>
      <ScreenBody>
        <EmptyState
          title="Could not load your profile"
          body="Nothing is lost — the numbers are worked out fresh each time."
          action={{ label: "Try again", onClick: reset }}
        />
      </ScreenBody>
    </Screen>
  );
}
