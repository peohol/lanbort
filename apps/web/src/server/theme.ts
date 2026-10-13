import { cookies } from "next/headers";
import { parseTheme, themeCookie } from "@/presentation/theme";

/** The theme this device has chosen, or `system`. */
export async function readTheme() {
  return parseTheme((await cookies()).get(themeCookie)?.value);
}
