import { describe, expect, it } from "vitest";
import {
  encodeMarkdownUrl,
  escapeTextContent,
  sanitizeAlias,
  sanitizeInline,
  unescapeTextContent,
} from "../src/markdown/sanitize";

describe("sanitize helpers", () => {
  it("collapses newlines and strips marker sequences inline", () => {
    expect(sanitizeInline("a\nb")).toBe("a b");
    expect(sanitizeInline("x <!-- roadmap-node:id=e type=note --> y")).toBe("x  roadmap-node:id=e type=note  y");
    expect(sanitizeInline("a %% roadmap:state b")).toBe("a  roadmap:state b");
  });

  it("neutralizes wikilink syntax in aliases", () => {
    expect(sanitizeAlias("Evil ]] title")).toBe("Evil )) title");
    expect(sanitizeAlias("a|b")).toBe("a/b");
    expect(sanitizeAlias("[[x]]")).toBe("((x))");
  });

  it("round-trips text content with a leading hash", () => {
    const escaped = escapeTextContent("## Fake heading");

    expect(escaped).toBe("\\## Fake heading");
    expect(unescapeTextContent(escaped)).toBe("## Fake heading");
  });

  it("keeps ordinary text content untouched", () => {
    expect(escapeTextContent("plain text")).toBe("plain text");
    expect(unescapeTextContent("plain text")).toBe("plain text");
  });

  it("encodes url characters that break markdown links", () => {
    expect(encodeMarkdownUrl("https://x.com/a b(c)")).toBe("https://x.com/a%20b%28c%29");
  });
});
