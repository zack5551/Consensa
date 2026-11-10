"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "./icons";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * A calm banner under the header while the device is offline. It announces itself once (role=status)
 * and disappears when the connection returns. The server always renders "online", so there's no flash.
 */
export function OfflineNotice({ message }: { message: string }) {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  return (
    <div role="status" aria-live="polite" className={online ? "sr-only" : ""}>
      {online ? null : (
        <p className="m-0 flex items-center justify-center gap-2 border-b border-line bg-sunken px-4 py-2 text-center text-body-sm text-ink">
          <Icon name="offline" className="size-4 text-ink-2" />
          {message}
        </p>
      )}
    </div>
  );
}
