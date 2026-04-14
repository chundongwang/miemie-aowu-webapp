"use client";

import { useEffect } from "react";

// Rotates between 🐑 and 🐺 in the browser tab favicon every second.
// Falls back gracefully if canvas is unavailable.
export default function FaviconRotator() {
  useEffect(() => {
    const emojis = ["🐑", "🐺"];
    let index = 0;

    function setFavicon(emoji: string) {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.font = "56px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(emoji, 32, 38);

        let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
        if (!link) {
          link = document.createElement("link");
          link.rel = "icon";
          document.head.appendChild(link);
        }
        link.href = canvas.toDataURL("image/png");
      } catch {
        // canvas unavailable — static favicon stays
      }
    }

    setFavicon(emojis[0]);
    const interval = setInterval(() => {
      index = (index + 1) % emojis.length;
      setFavicon(emojis[index]);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return null;
}
