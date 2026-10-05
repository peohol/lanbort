import type { ApiFailureCode } from "@/components/api-client";
import { errorMessage } from "@/components/error-messages";
import { ChatApiError } from "./api";

const chatMessages: Partial<Record<ApiFailureCode, string>> = {
  conflict: "Noe endret seg samtidig. Last siden på nytt og prøv igjen.",
  forbidden:
    "Denne enheten har ikke tilgang til chatten lenger. Last siden på nytt.",
  not_found: "Samtalen eller personen finnes ikke, eller er ikke tilgjengelig.",
};

/** What went wrong in chat, in words. */
export function chatErrorMessage(problem: unknown): string {
  const code =
    problem instanceof ChatApiError
      ? problem.code
      : typeof problem === "string"
        ? (problem as ApiFailureCode)
        : "internal_error";
  return chatMessages[code] ?? errorMessage(code);
}
