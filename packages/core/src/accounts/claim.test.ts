import { describe, expect, it } from "vitest";
import { LOCAL_OWNER } from "../model/account.js";
import type { AccountId, DigestId, SourceId, TopicId } from "../model/ids.js";
import { emptyState, STATE_VERSION, type AppState } from "../model/state.js";
import { makeDigest, makeSource, makeTopic } from "../testing/builders.js";
import {
  claimState,
  clearedLocalState,
  isEmptyState,
  stateCounts,
  summariseClaim,
} from "./claim.js";

const account = "acc_1" as AccountId;

const withData = (over: Partial<AppState> = {}): AppState => ({
  ...emptyState(),
  topics: { ["t_local" as TopicId]: makeTopic({ id: "t_local" as TopicId, title: "Локальная" }) },
  sources: { ["s_local" as SourceId]: makeSource({ id: "s_local" as SourceId }) },
  ...over,
});

const remote = (over: Partial<AppState> = {}): AppState => ({
  ...emptyState(),
  topics: { ["t_cloud" as TopicId]: makeTopic({ id: "t_cloud" as TopicId, title: "Облачная" }) },
  digests: { ["d_cloud" as DigestId]: makeDigest({ id: "d_cloud" as DigestId }) },
  ...over,
});

describe("stateCounts / isEmptyState", () => {
  it("counts every collection", () => {
    expect(stateCounts(withData())).toMatchObject({ topics: 1, sources: 1, digests: 0 });
  });

  it("recognises a state with nothing in it, settings notwithstanding", () => {
    expect(isEmptyState(emptyState())).toBe(true);
    const tweaked: AppState = {
      ...emptyState(),
      settings: { ...emptyState().settings, sourceRefreshDays: 3 },
    };
    expect(isEmptyState(tweaked)).toBe(true);
    expect(isEmptyState(withData())).toBe(false);
  });
});

describe("summariseClaim", () => {
  it("asks nothing when the device is empty", () => {
    expect(summariseClaim(emptyState(), remote()).needsChoice).toBe(false);
  });

  it("asks nothing when the account is empty — a fresh registration", () => {
    expect(summariseClaim(withData(), emptyState()).needsChoice).toBe(false);
  });

  it("asks when both sides hold data", () => {
    const summary = summariseClaim(withData(), remote());
    expect(summary.needsChoice).toBe(true);
    expect(summary.suggested).toBe("merge");
    expect(summary.local.topics).toBe(1);
    expect(summary.account.topics).toBe(1);
  });
});

describe("claimState — merge", () => {
  const merged = () =>
    claimState({ local: withData(), account: remote(), accountId: account, strategy: "merge" });

  it("keeps both sides' records", () => {
    expect(Object.keys(merged().topics).sort()).toEqual(["t_cloud", "t_local"]);
    expect(Object.keys(merged().sources)).toEqual(["s_local"]);
    expect(Object.keys(merged().digests)).toEqual(["d_cloud"]);
  });

  it("hands the result to the account", () => {
    expect(merged().owner).toEqual({ kind: "account", accountId: account });
    expect(merged().version).toBe(STATE_VERSION);
  });

  it("lets the account's copy win when both hold the same id", () => {
    const local = withData({
      topics: { ["shared" as TopicId]: makeTopic({ id: "shared" as TopicId, title: "С устройства" }) },
    });
    const cloud = remote({
      topics: { ["shared" as TopicId]: makeTopic({ id: "shared" as TopicId, title: "Из аккаунта" }) },
    });
    const result = claimState({ local, account: cloud, accountId: account, strategy: "merge" });
    expect(result.topics["shared" as TopicId]!.title).toBe("Из аккаунта");
  });

  it("takes the device's settings when the account is fresh", () => {
    const local = withData({ settings: { ...emptyState().settings, sourceRefreshDays: 3 } });
    const result = claimState({
      local,
      account: emptyState(),
      accountId: account,
      strategy: "merge",
    });
    expect(result.settings.sourceRefreshDays).toBe(3);
  });

  it("takes the account's settings when the account already has data", () => {
    const local = withData({ settings: { ...emptyState().settings, sourceRefreshDays: 3 } });
    const cloud = remote({ settings: { ...emptyState().settings, sourceRefreshDays: 14 } });
    const result = claimState({ local, account: cloud, accountId: account, strategy: "merge" });
    expect(result.settings.sourceRefreshDays).toBe(14);
  });

  it("never mixes half of one settings object with half of another", () => {
    const local = withData({
      settings: { ...emptyState().settings, sourceRefreshDays: 3, model: "claude-haiku-4-5" },
    });
    const cloud = remote({
      settings: { ...emptyState().settings, sourceRefreshDays: 14, model: "claude-sonnet-5" },
    });
    const result = claimState({ local, account: cloud, accountId: account, strategy: "merge" });
    expect(result.settings).toEqual(cloud.settings);
  });
});

describe("claimState — keeping one side", () => {
  it("keeps only what the account had", () => {
    const result = claimState({
      local: withData(),
      account: remote(),
      accountId: account,
      strategy: "keep-account",
    });
    expect(Object.keys(result.topics)).toEqual(["t_cloud"]);
    expect(result.owner).toEqual({ kind: "account", accountId: account });
  });

  it("keeps only what the device had", () => {
    const result = claimState({
      local: withData(),
      account: remote(),
      accountId: account,
      strategy: "keep-local",
    });
    expect(Object.keys(result.topics)).toEqual(["t_local"]);
    expect(result.owner).toEqual({ kind: "account", accountId: account });
  });
});

describe("clearedLocalState", () => {
  it("empties the device's own document but keeps it local", () => {
    const cleared = clearedLocalState(withData());
    expect(isEmptyState(cleared)).toBe(true);
    expect(cleared.owner).toEqual(LOCAL_OWNER);
  });

  it("leaves settings alone so the app looks the same after signing out", () => {
    const local = withData({ settings: { ...emptyState().settings, model: "claude-sonnet-5" } });
    expect(clearedLocalState(local).settings.model).toBe("claude-sonnet-5");
  });
});
