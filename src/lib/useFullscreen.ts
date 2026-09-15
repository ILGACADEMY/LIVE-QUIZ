"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Wraps the browser's actual Fullscreen API — the only thing that can
 * hide a browser's own tabs/address bar; no amount of CSS can do this.
 * Esc-to-exit is handled natively by the browser itself once real
 * fullscreen is active, nothing to build for that separately.
 *
 * This replaces an earlier, inconsistent pattern where one button used
 * the real API and a different one (the old "Show QR full screen") only
 * faked it with a CSS overlay that never actually hid the browser chrome
 * — exactly why that one still showed tabs/the address bar.
 */
export function useFullscreen(elementId: string) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function handleChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  const enter = useCallback(() => {
    document.getElementById(elementId)?.requestFullscreen().catch(() => {
      // Some browsers/contexts (e.g. an iframe without allowfullscreen)
      // reject this — nothing to recover from client-side, the button
      // simply won't visibly do anything, which is safer than throwing.
    });
  }, [elementId]);

  const exit = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) exit();
    else enter();
  }, [enter, exit]);

  return { isFullscreen, enter, exit, toggle };
}
