import { handleNotificationWorker } from "../../../../features/intake-notifications/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = handleNotificationWorker;
export const POST = handleNotificationWorker;
