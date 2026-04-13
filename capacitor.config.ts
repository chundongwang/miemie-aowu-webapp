import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.miemieaowu.app",
  appName: "咩咩嗷呜",
  webDir: "out",
  server: {
    // During development, point to local Next.js server
    // Comment out for production builds
    // url: "http://localhost:3000",
    // cleartext: true,
  },
};

export default config;
