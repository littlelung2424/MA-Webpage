import { staticHtmlResponse } from "../../../lib/staticHtml";

export async function GET() {
  return staticHtmlResponse("static-pages/workspace/order-verification/index.html");
}
