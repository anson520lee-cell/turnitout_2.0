import "server-only";
import { ManualTurnitinProvider } from "./manual-turnitin-provider";
import type { ScreeningProvider } from "./types";

/**
 * Only the manual provider exists. An `AuthorizedTurnitinProvider` may be
 * added here if, and only if, an officially permitted integration becomes
 * available. Do not add scraping or browser automation.
 */
export function getScreeningProvider(): ScreeningProvider {
  return new ManualTurnitinProvider();
}
