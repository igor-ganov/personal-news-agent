import { describeJobSyncError, type AppError, type JobPollingOptions } from "@pna/app";

const PREFIX = "Генерация на сервере: ";

/**
 * Reports a failed look at the server's jobs on the shell, and takes the
 * warning down once a look works again.
 *
 * Only its own warning is cleared: the shell carries one message at a time,
 * and a save or sync failure raised meanwhile must stay where it is.
 */
export const jobPollingWarning = (
  shell: () => HTMLElement | undefined,
): Required<Pick<JobPollingOptions, "onError" | "onSuccess">> => ({
  onError: (error: AppError) =>
    shell()?.setAttribute("warning", `${PREFIX}${describeJobSyncError(error)}`),
  onSuccess: () => {
    const element = shell();
    if (element?.getAttribute("warning")?.startsWith(PREFIX)) element.removeAttribute("warning");
  },
});
