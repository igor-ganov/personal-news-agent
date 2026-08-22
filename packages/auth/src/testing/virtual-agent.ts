import type { PasskeyAgent } from "../ports/passkeys.js";
import { createVirtualAuthenticator } from "./virtual-authenticator.js";

export interface VirtualAgentOptions {
  readonly rpId: string;
  readonly origin: string;
  /** Makes every prompt fail the way a dismissed system dialog does. */
  readonly refuse?: boolean;
  readonly available?: boolean;
}

const refusal = (): never => {
  const error = new Error("Пользователь отменил");
  error.name = "NotAllowedError";
  throw error;
};

/** The software authenticator behind the passkey port, for tests and demos. */
export const virtualPasskeyAgent = (options: VirtualAgentOptions): PasskeyAgent => {
  const authenticator = createVirtualAuthenticator({ rpId: options.rpId, origin: options.origin });

  return {
    isAvailable: async () => options.available ?? true,
    create: async (creation) =>
      options.refuse ? refusal() : await authenticator.create(creation),
    get: async (request) => (options.refuse ? refusal() : await authenticator.get(request)),
  };
};
