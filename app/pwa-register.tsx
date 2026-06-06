"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister();
        });
      });
      return;
    }

    const registerServiceWorker = () => {
      navigator.serviceWorker.register("/sw.js").then((registration) => {
        void registration.update();
      }).catch(() => {
        // A failed registration should not block using the score sheet.
      });
    };

    let refreshing = false;
    const handleControllerChange = () => {
      if (refreshing) {
        return;
      }
      refreshing = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    if (document.readyState === "complete") {
      registerServiceWorker();
      return () => {
        navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      };
    }

    window.addEventListener("load", registerServiceWorker);
    return () => {
      window.removeEventListener("load", registerServiceWorker);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  return null;
}
