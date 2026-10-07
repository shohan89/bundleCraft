import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// In-process caches are off in tests so database changes are seen immediately; the cache
// behaviour has its own tests that build caches with an explicit TTL.
process.env.STOREFRONT_SHOP_CACHE_MS = "0";
process.env.TEMPLATE_CACHE_MS = "0";
process.env.RATE_LIMIT = "off";

afterEach(() => {
  cleanup();
});
