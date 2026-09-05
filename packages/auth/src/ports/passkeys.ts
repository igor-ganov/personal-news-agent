/**
 * The one thing authentication needs from the platform: make a passkey, and
 * use a passkey.
 *
 * Everything binary crosses this port as base64url, exactly as the server
 * sends and expects it — which is what lets the browser's WebAuthn API, an
 * Android Credential Manager plugin, and a software authenticator in tests
 * all sit behind the same three methods.
 */

export interface CredentialDescriptorJson {
  readonly id: string;
  readonly type?: string;
  readonly transports?: readonly string[];
}

export interface PasskeyCreationOptions {
  readonly challenge: string;
  readonly rp: { readonly id?: string; readonly name: string };
  readonly user: { readonly id: string; readonly name: string; readonly displayName: string };
  readonly pubKeyCredParams: readonly { readonly type: string; readonly alg: number }[];
  readonly timeout?: number;
  readonly excludeCredentials?: readonly CredentialDescriptorJson[];
  readonly authenticatorSelection?: Readonly<Record<string, unknown>>;
  readonly attestation?: string;
  readonly extensions?: Readonly<Record<string, unknown>>;
}

export interface PasskeyRequestOptions {
  readonly challenge: string;
  readonly rpId?: string;
  readonly timeout?: number;
  readonly allowCredentials?: readonly CredentialDescriptorJson[];
  readonly userVerification?: string;
  readonly extensions?: Readonly<Record<string, unknown>>;
}

/**
 * How badly the caller wants a dialog.
 *
 * `immediate` asks the platform to answer from what it already has and give up
 * silently if that is nothing. It is what turns "войти" on a fresh device from
 * a dead-end sheet ("No available sign-in") into an instant decision to create
 * a key instead — the user presses once, puts a finger on the sensor, and is in.
 */
export interface PasskeyHints {
  readonly immediate?: boolean;
}

export interface RegistrationResponseJson {
  readonly id: string;
  readonly rawId: string;
  readonly type: string;
  readonly authenticatorAttachment?: string | null;
  readonly clientExtensionResults: Readonly<Record<string, unknown>>;
  readonly response: {
    readonly clientDataJSON: string;
    readonly attestationObject: string;
    readonly transports?: readonly string[];
  };
}

export interface AuthenticationResponseJson {
  readonly id: string;
  readonly rawId: string;
  readonly type: string;
  readonly authenticatorAttachment?: string | null;
  readonly clientExtensionResults: Readonly<Record<string, unknown>>;
  readonly response: {
    readonly clientDataJSON: string;
    readonly authenticatorData: string;
    readonly signature: string;
    readonly userHandle: string | null;
  };
}

export interface PasskeyAgent {
  /** False on a device with no authenticator — the UI then explains instead of failing. */
  isAvailable(): Promise<boolean>;
  create(options: PasskeyCreationOptions): Promise<RegistrationResponseJson>;
  get(options: PasskeyRequestOptions, hints?: PasskeyHints): Promise<AuthenticationResponseJson>;
}
