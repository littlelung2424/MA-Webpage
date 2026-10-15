export async function GET(request: Request) {
  return Response.redirect(new URL("/workspace", request.url), 308);
}
