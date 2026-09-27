// @ts-check
const { defineConfig, devices } = require("@playwright/test");

const PORT = Number(process.env.E2E_PORT) || 3100;

module.exports = defineConfig({
  testDir: "tests/e2e",
  timeout: 30 * 1000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // Software WebGL so the MapLibre path is exercised on CI machines without a GPU.
    launchOptions: { args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] }
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } }
  ],
  webServer: {
    command: "node dev-server.js",
    env: { PORT: String(PORT) },
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI
  }
});
