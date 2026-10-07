import { authenticateApiRequest } from "@/lib/api/guard";
import { ok, toErrorResponse } from "@/lib/api/response";
import { parseTemplateId } from "@/lib/templates/validation";
import { getTemplate } from "@/services/templates/templates";

/** One active template. Unknown, retired and unreadable templates are all a plain 404. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await authenticateApiRequest(request);
    const id = parseTemplateId((await params).id);
    return ok({ template: await getTemplate(id) });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
