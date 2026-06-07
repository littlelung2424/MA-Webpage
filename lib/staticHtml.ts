import { readFile } from "node:fs/promises";
import path from "node:path";

const STATIC_HTML_CONTENT_TYPE = "text/html; charset=utf-8";

export async function readStaticHtmlPage(filePath: string) {
  return readFile(path.join(/* turbopackIgnore: true */ process.cwd(), filePath), "utf8");
}

export async function staticHtmlResponse(filePath: string) {
  const html = await readStaticHtmlPage(filePath);

  return new Response(html, {
    headers: {
      "Content-Type": STATIC_HTML_CONTENT_TYPE,
    },
  });
}
