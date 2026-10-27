import {
  hasStaffPermission,
  isStaffRole,
  type StaffPermission,
} from "@sellbridge/shared/staff-access";
import { ADMIN_MODE_COOKIE } from "@/features/auth/admin-mode-cookie";

/*
 * Who may take an admin spreadsheet: someone signed in, on the team, with admin mode on and the
 * permission of that file. Kept apart from the session lookup so the rules are tested alone.
 */

export interface ExportRequester {
  signedIn: boolean;
  role: string | null;
  adminMode: boolean;
}

export interface ExportRefusal {
  status: 401 | 403;
  message: string;
}

export function exportRefusal(
  requester: ExportRequester,
  permission: StaffPermission,
): ExportRefusal | null {
  if (!requester.signedIn) {
    return { status: 401, message: "Faça login para baixar esta planilha." };
  }
  if (!isStaffRole(requester.role)) {
    return { status: 403, message: "Esta planilha é só para a equipe SellBridge." };
  }
  if (!requester.adminMode) {
    return { status: 403, message: "Ligue o modo equipe para baixar esta planilha." };
  }
  if (!hasStaffPermission(requester.role, permission)) {
    return { status: 403, message: "Seu papel na equipe não dá acesso a esta planilha." };
  }
  return null;
}

/** Whether the request carries admin mode on, read from its `Cookie` header. */
export function adminModeFromCookie(cookieHeader: string | null): boolean {
  if (cookieHeader === null) {
    return false;
  }
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .some((part) => part === `${ADMIN_MODE_COOKIE}=on`);
}
