import { Type } from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerPi, type PiApi, type TypeFactory } from '../../dist/integrations/pi.js';

// A single structural boundary keeps the shared core independent of Pi's SDK.
export default function (pi: ExtensionAPI) {
  registerPi(pi as unknown as PiApi, Type as unknown as TypeFactory);
}
