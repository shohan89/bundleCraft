/** Shared fake billing gateway for tests that mock `./gateway` (see testing.ts). */
import { createFakeBillingGateway } from "./testing";

export const fakeBilling = createFakeBillingGateway();
