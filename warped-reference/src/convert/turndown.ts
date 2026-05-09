import TurndownService from "turndown";

/**
 * Pre-configured turndown instance for Google Docs HTML → markdown conversion.
 *
 * Custom rules:
 * - Strips <style>, <script>, <meta>, <link> elements (Google Docs CSS noise)
 * - Decodes Google Docs CSS-encoded list nesting (lst-kix_*-N classes on <ol>/<ul>)
 */
export function createTurndownService(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });

  // Strip elements that Google Docs HTML includes but have no markdown equivalent.
  turndown.remove(["style", "script", "meta", "link"]);

  // Google Docs HTML encodes list nesting via CSS classes on the parent <ol>/<ul>
  // (e.g. lst-kix_abc123-2 = depth 2) rather than nested DOM elements.
  turndown.addRule("googleDocsListItem", {
    filter: "li",
    replacement(content: string, node: any, options: any): string {
      const parentClass = node.parentNode?.getAttribute?.("class") ?? "";
      const depthMatch = parentClass.match(/lst-kix_[a-z0-9]+-(\d+)/);
      const depth = depthMatch ? parseInt(depthMatch[1], 10) : 0;
      const indent = "    ".repeat(depth);

      content = content
        .replace(/^\n+/, "")
        .replace(/\n+$/, "\n")
        .replace(/\n/gm, "\n" + indent + "    ");

      let prefix: string;
      const parent = node.parentNode;
      if (parent?.nodeName === "OL") {
        const start = parent.getAttribute?.("start");
        const index = Array.prototype.indexOf.call(parent.children, node);
        prefix = (start ? Number(start) + index : index + 1) + ". ";
      } else {
        prefix = options.bulletListMarker + " ";
      }

      return indent + prefix + content + (node.nextSibling && !/\n$/.test(content) ? "\n" : "");
    },
  });

  return turndown;
}
