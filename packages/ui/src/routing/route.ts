import type { LessonId, ProgramId, TopicId } from "@pna/core";

export const TOPIC_TABS = ["news", "skills", "sources", "about"] as const;
export type TopicTab = (typeof TOPIC_TABS)[number];

/** Every screen the app can be on, as a value. */
export type Route =
  | { readonly name: "topics" }
  | { readonly name: "topic"; readonly topicId: TopicId; readonly tab: TopicTab }
  | { readonly name: "program"; readonly programId: ProgramId }
  | { readonly name: "lesson"; readonly lessonId: LessonId }
  | { readonly name: "settings" }
  | { readonly name: "account" };

export const HOME: Route = { name: "topics" };

const isTab = (value: string): value is TopicTab =>
  (TOPIC_TABS as readonly string[]).includes(value);

/**
 * Parses a location hash into a route. Anything unrecognised falls back to the
 * topic list rather than rendering an error screen — a bad link should not
 * strand the user.
 */
export const parseRoute = (hash: string): Route => {
  const clean = hash.replace(/^#/, "").replace(/^\//, "");
  const [path = "", query = ""] = clean.split("?");
  const segments = path.split("/").filter((s) => s.length > 0);
  const params = new URLSearchParams(query);

  if (segments.length === 0) return HOME;

  switch (segments[0]) {
    case "t": {
      const id = segments[1];
      if (!id) return HOME;
      const tab = params.get("tab") ?? "";
      return {
        name: "topic",
        topicId: decodeURIComponent(id) as TopicId,
        tab: isTab(tab) ? tab : "news",
      };
    }
    case "p": {
      const id = segments[1];
      return id ? { name: "program", programId: decodeURIComponent(id) as ProgramId } : HOME;
    }
    case "l": {
      const id = segments[1];
      return id ? { name: "lesson", lessonId: decodeURIComponent(id) as LessonId } : HOME;
    }
    case "settings":
      return { name: "settings" };
    case "account":
      return { name: "account" };
    default:
      return HOME;
  }
};

export const routeHref = (route: Route): string => {
  switch (route.name) {
    case "topics":
      return "#/";
    case "topic":
      return `#/t/${encodeURIComponent(route.topicId)}?tab=${route.tab}`;
    case "program":
      return `#/p/${encodeURIComponent(route.programId)}`;
    case "lesson":
      return `#/l/${encodeURIComponent(route.lessonId)}`;
    case "settings":
      return "#/settings";
    case "account":
      return "#/account";
  }
};

export const sameRoute = (a: Route, b: Route): boolean => routeHref(a) === routeHref(b);
