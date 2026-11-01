import { describe, expect, it } from "vitest";
import { mergeStates } from "../accounts/claim.js";
import { topicId } from "../model/ids.js";
import { emptyState, type AppState } from "../model/state.js";
import { makeTopic, T0 } from "../testing/builders.js";
import { addMs } from "../time/instant.js";
import { recordDeletions } from "./tombstones.js";

const A = topicId("topic-a");
const B = topicId("topic-b");

const withTopics = (...topics: ReturnType<typeof makeTopic>[]): AppState => ({
  ...emptyState(),
  topics: Object.fromEntries(topics.map((t) => [t.id, t])),
});

describe("recordDeletions", () => {
  it("leaves a tombstone for every record a change removed", () => {
    const before = withTopics(makeTopic({ id: A }), makeTopic({ id: B }));
    const after = withTopics(makeTopic({ id: B }));

    const stamped = recordDeletions(before, after, addMs(T0, 1000));

    expect(stamped.deleted).toEqual({ [`topics:${A}`]: addMs(T0, 1000) });
  });

  it("lifts the tombstone when the same key comes back", () => {
    const deleted = recordDeletions(withTopics(makeTopic({ id: A })), emptyState(), T0);
    const revived = recordDeletions(deleted, { ...deleted, topics: withTopics(makeTopic({ id: A })).topics }, addMs(T0, 5));

    expect(revived.deleted).toEqual({});
  });
});

describe("mergeStates", () => {
  it("does not bring back a topic another device deleted", () => {
    const topic = makeTopic({ id: A, updatedAt: T0 });
    const remote = recordDeletions(withTopics(topic), emptyState(), addMs(T0, 60_000));
    const local = withTopics(topic);

    const merged = mergeStates(remote, local);

    expect(merged.topics[A]).toBeUndefined();
    expect(merged.deleted[`topics:${A}`]).toBe(addMs(T0, 60_000));
  });

  it("does not bring back a topic this device deleted", () => {
    const topic = makeTopic({ id: A, updatedAt: T0 });
    const local = recordDeletions(withTopics(topic), emptyState(), addMs(T0, 60_000));

    const merged = mergeStates(withTopics(topic), local);

    expect(merged.topics[A]).toBeUndefined();
  });

  it("keeps a record edited after it was deleted elsewhere", () => {
    const remote = recordDeletions(withTopics(makeTopic({ id: A })), emptyState(), T0);
    const edited = makeTopic({ id: A, title: "edited later", updatedAt: addMs(T0, 1) });

    const merged = mergeStates(remote, withTopics(edited));

    expect(merged.topics[A]?.title).toBe("edited later");
  });

  it("takes the newer copy of a record both sides hold, whichever side wins ties", () => {
    const older = makeTopic({ id: A, title: "old", updatedAt: T0 });
    const newer = makeTopic({ id: A, title: "new", updatedAt: addMs(T0, 1) });

    expect(mergeStates(withTopics(newer), withTopics(older)).topics[A]?.title).toBe("new");
    expect(mergeStates(withTopics(older), withTopics(newer)).topics[A]?.title).toBe("new");
  });
});
