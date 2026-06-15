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

    let registration: ServiceWorkerRegistration | null = null;
    const updateServiceWorker = () => {
      if (document.visibilityState === "visible") {
        void registration?.update();
      }
    };
    const registerServiceWorker = () => {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((nextRegistration) => {
        registration = nextRegistration;
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
    window.addEventListener("online", updateServiceWorker);
    document.addEventListener("visibilitychange", updateServiceWorker);

    if (document.readyState === "complete") {
      registerServiceWorker();
      return () => {
        navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
        window.removeEventListener("online", updateServiceWorker);
        document.removeEventListener("visibilitychange", updateServiceWorker);
      };
    }

    window.addEventListener("load", registerServiceWorker);
    return () => {
      window.removeEventListener("load", registerServiceWorker);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      window.removeEventListener("online", updateServiceWorker);
      document.removeEventListener("visibilitychange", updateServiceWorker);
    };
  }, []);

  return null;
}
