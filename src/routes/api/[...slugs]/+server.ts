import app from "../../../api";
import type { RequestHandler } from "./$types";

export const fallback: RequestHandler = ({ request }) => app.handle(request);
