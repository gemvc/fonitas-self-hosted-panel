import { resolveBoundApplicationId } from "./bound-application";
import { isTicketClosed } from "./customer-binding";
import { customerJson, customerRequest, CustomerApiError } from "./customer-api";

export { isTicketClosed };

export type SupportWorkspace = {
  public_id?: string;
  id?: string;
  slug?: string;
  name?: string;
};

export type SupportTicket = {
  public_id: string;
  workspace_id: string;
  subject: string;
  category: string;
  status: string;
  priority?: string;
  created_at?: string;
  updated_at?: string;
  closed_at?: string | null;
  application_id?: string | null;
};

export type SupportMessage = {
  public_id: string;
  message: string;
  message_type: string;
  created_at: string;
  sender_id?: string;
};

function workspaceId(ws: SupportWorkspace): string | null {
  return (ws.public_id || ws.id || "").trim() || null;
}

async function listWorkspaces(): Promise<SupportWorkspace[]> {
  const body = await customerJson<{ data: SupportWorkspace[] }>("/support/workspaces");
  return body.data ?? [];
}

function slugify(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "app-support";
}

/** Ensure a Support workspace exists in the current Identity tenant (C-30). */
export async function ensureSupportWorkspace(brandName = "Application support"): Promise<string> {
  const existing = await listWorkspaces();
  if (existing.length > 0) {
    const id = workspaceId(existing[0]);
    if (id) return id;
  }
  const applicationId = await resolveBoundApplicationId();
  const created = await customerJson<{ data: SupportWorkspace }>("/support/workspaces", {
    method: "POST",
    body: JSON.stringify({
      slug: slugify(brandName),
      name: brandName.slice(0, 120) || "Application support",
      default_locale: "en",
      owner_application_id: applicationId,
    }),
  });
  const id = workspaceId(created.data);
  if (!id) throw new CustomerApiError("workspace_create_failed");
  return id;
}

export async function listTickets(workspaceIdValue: string): Promise<SupportTicket[]> {
  const body = await customerJson<{ data: SupportTicket[] }>(
    `/support/workspaces/${encodeURIComponent(workspaceIdValue)}/tickets?per_page=50`,
  );
  return body.data ?? [];
}

export async function createTicket(
  workspaceIdValue: string,
  input: { subject: string; category: string; priority?: string },
): Promise<SupportTicket> {
  const applicationId = await resolveBoundApplicationId();
  const body = await customerJson<{ data: SupportTicket }>(
    `/support/workspaces/${encodeURIComponent(workspaceIdValue)}/tickets`,
    {
      method: "POST",
      body: JSON.stringify({
        subject: input.subject,
        category: input.category || "general",
        priority: input.priority || "NORMAL",
        source: "PORTAL",
        application_id: applicationId,
      }),
    },
  );
  return body.data;
}

export async function getTicket(ticketId: string): Promise<SupportTicket> {
  const body = await customerJson<{ data: SupportTicket }>(
    `/support/tickets/${encodeURIComponent(ticketId)}`,
  );
  return body.data;
}

/** GET /support/tickets/{id}/messages — NOTE filtered server-side for non-agents. */
export async function listTicketMessages(ticketId: string): Promise<SupportMessage[]> {
  const body = await customerJson<{ data: SupportMessage[] }>(
    `/support/tickets/${encodeURIComponent(ticketId)}/messages`,
  );
  return body.data ?? [];
}

export async function replyToTicket(ticketId: string, message: string): Promise<void> {
  await customerJson(`/support/tickets/${encodeURIComponent(ticketId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ message, message_type: "COMMENT" }),
  });
}

export async function resolveTicket(ticketId: string): Promise<SupportTicket> {
  const body = await customerJson<{ data: SupportTicket }>(
    `/support/tickets/${encodeURIComponent(ticketId)}/resolve`,
    { method: "POST", body: "{}" },
  );
  return body.data;
}

export async function closeTicket(ticketId: string): Promise<SupportTicket> {
  const body = await customerJson<{ data: SupportTicket }>(
    `/support/tickets/${encodeURIComponent(ticketId)}/close`,
    { method: "POST", body: "{}" },
  );
  return body.data;
}

export async function reopenTicket(ticketId: string): Promise<SupportTicket> {
  const body = await customerJson<{ data: SupportTicket }>(
    `/support/tickets/${encodeURIComponent(ticketId)}/reopen`,
    { method: "POST", body: "{}" },
  );
  return body.data;
}

/** Buyer may act as agent only when /auth/me includes support.ticket.assign. */
export async function viewerCanAssignTickets(): Promise<boolean> {
  try {
    const response = await customerRequest("/auth/me", { method: "GET", csrf: false });
    if (!response.ok) return false;
    const body = await response.json() as {
      data?: { permissions?: string[]; roles?: Array<{ permissions?: string[] }> };
    };
    const direct = body.data?.permissions ?? [];
    if (direct.includes("support.ticket.assign")) return true;
    const nested = (body.data?.roles ?? []).flatMap(r => r.permissions ?? []);
    return nested.includes("support.ticket.assign");
  } catch {
    return false;
  }
}

export { CustomerApiError };
