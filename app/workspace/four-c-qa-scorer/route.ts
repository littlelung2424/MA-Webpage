import { staticHtmlResponse } from "../../../lib/staticHtml";

export async function GET() {
  return staticHtmlResponse("static-pages/workspace/four-c-qa-scorer/index.html");
}
