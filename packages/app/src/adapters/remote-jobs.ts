import type { AuthError, JobsClient, RemoteJob } from "@pna/auth";
import { err, ok, type Result } from "@pna/core";
import { appError, type AppError } from "../errors.js";
import type { JobView, JobsGateway } from "../ports/jobs.js";

/** One vocabulary for failures: the UI never sees an auth-shaped error. */
const toAppError = (error: AuthError): AppError => appError(error.kind, error.message);

const toView = (job: RemoteJob): JobView => ({
  id: job.id,
  key: job.key,
  kind: job.kind,
  status: job.status,
  meta: job.meta,
  result: job.result,
  error: job.error,
});

/** Where the token comes from — the account service holds the live session. */
export interface TokenSource {
  current(): { readonly token: string } | null;
}

const NO_SESSION: AppError = appError("unauthorized", "Нужно войти в аккаунт");

/**
 * The jobs port over the account API.
 *
 * The token is read per call rather than captured: signing out and back in
 * during a session must not leave the gateway using a dead one.
 */
export const createRemoteJobs = (client: JobsClient, sessions: TokenSource): JobsGateway => {
  const withToken = async <T>(
    call: (token: string) => Promise<Result<T, AuthError>>,
  ): Promise<Result<T, AppError>> => {
    const session = sessions.current();
    if (!session) return err(NO_SESSION);

    const result = await call(session.token);
    return result.ok ? ok(result.value) : err(toAppError(result.error));
  };

  return {
    async list() {
      const listed = await withToken((token) => client.list(token));
      return listed.ok ? ok(listed.value.map(toView)) : listed;
    },

    async submit(submission) {
      const submitted = await withToken((token) => client.submit(token, submission));
      return submitted.ok ? ok(toView(submitted.value)) : submitted;
    },

    dismiss: (id) => withToken((token) => client.dismiss(token, id)),

    credentials: () => withToken((token) => client.providerKey(token)),

    setCredentials: (apiKey, model) =>
      withToken((token) => client.setProviderKey(token, apiKey, model)),
  };
};
