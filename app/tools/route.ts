import { staticHtmlResponse } from "../../lib/staticHtml";

export async function GET() {
  return staticHtmlResponse("static-pages/tools/index.html");
}
