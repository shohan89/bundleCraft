/** Shared fake catalog gateway for tests that mock `./gateway` (see testing.ts). */
import { createFakeCatalogGateway } from "./testing";

export const fakeCatalog = createFakeCatalogGateway();
