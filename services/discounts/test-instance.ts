/** Shared fake gateway instance for tests that mock `./gateway` (see testing.ts). */
import { createFakeGateway } from "./testing";

export const fakeGateway = createFakeGateway();
