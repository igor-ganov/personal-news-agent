import type { AgentJobKind } from "@pna/agent/jobs";
import type { Result } from "@pna/core";
import type { AppError } from "../errors.js";

/**
 * Generation that happens somewhere the app cannot be killed.
 *
 * The port is deliberately small: submit work, read what is in flight, say when
 * a result has been dealt with. Everything about *what* is being generated
 * stays on this side; the gateway only moves opaque payloads.
 */
export type JobStatus = "queued" | "running" | "done" | "failed";

export interface JobFailure {
  readonly kind: string;
  readonly message: string;
}

export interface JobView {
  readonly id: string;
  /** The task key the UI tracks this work under. */
  readonly key: string;
  readonly kind: string;
  readonly status: JobStatus;
  readonly meta: unknown;
  readonly result: unknown;
  readonly error: JobFailure | null;
}

export interface JobSubmission {
  readonly key: string;
  readonly kind: AgentJobKind;
  readonly input: unknown;
  readonly meta: unknown;
}

/** What the server can generate with, as far as this account is concerned. */
export interface GeneratorCredentials {
  /** Whether generation is possible at all — this account's key or the server's. */
  readonly configured: boolean;
  /** Whether the key in use was uploaded by this account. */
  readonly ownKey: boolean;
  readonly model: string;
}

export interface JobsGateway {
  list(): Promise<Result<readonly JobView[], AppError>>;
  submit(submission: JobSubmission): Promise<Result<JobView, AppError>>;
  /** The app is done with this job: result applied, or failure dismissed. */
  dismiss(id: string): Promise<Result<true, AppError>>;
  credentials(): Promise<Result<GeneratorCredentials, AppError>>;
  /**
   * Hands the server the key it should generate with. Without this the account
   * can sign in and sync but has nothing to run a job with.
   */
  setCredentials(apiKey: string, model: string): Promise<Result<GeneratorCredentials, AppError>>;
}
