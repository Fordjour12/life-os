import { useEffect, useState, type PropsWithChildren } from "react";

import {
  BOOT_MIN_DURATION_MS,
  BootSequenceView,
  useBootAnimation,
} from "@/components/boot-sequence";

export function BootGate({ children }: PropsWithChildren) {
  const { progress, scanOffset } = useBootAnimation();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setIsReady(true);
    }, BOOT_MIN_DURATION_MS);

    return () => clearTimeout(timeout);
  }, []);

  if (!isReady) {
    return <BootSequenceView progress={progress} scanOffset={scanOffset} />;
  }

  return <>{children}</>;
}
