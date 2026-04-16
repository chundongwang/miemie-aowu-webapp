import type { CapacitorConfig } from "@capacitor/cli";

const isDev = process.env.NODE_ENV === "development";

const config: CapacitorConfig = {
  appId: "com.miemieaowu.app",
  appName: "咩咩嗷呜",
  webDir: "out",
  server: isDev
    ? {
        // Point to local Next.js dev server (npm run dev runs on port 4200)
        url: "http://localhost:4200",
        cleartext: true,
      }
    : {
        // Load live web app — avoids needing a static export
        url: "https://miemieaowu.ai",
        cleartext: false,
      },
  plugins: {
    Camera: {
      iosUsageDescription:
        "We use your camera and photo library to add photos to your recommendation lists.",
      photoLibraryUsageDescription:
        "We use your photo library to add photos to your recommendation lists.",
      photoLibraryAddUsageDescription:
        "We save images from your lists to your photo library.",
    },
    StatusBar: {
      style: "Dark",
      overlaysWebView: true,
    },
  },
};

export default config;
