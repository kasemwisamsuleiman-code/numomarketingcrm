import { createServerFn } from "@tanstack/react-start";
import { createHash, timingSafeEqual } from "node:crypto";

function matches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export const verifyAccessPassword = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string }) => ({
    password: typeof data?.password === "string" ? data.password : "",
  }))
  .handler(async ({ data }) => {
    const expected = process.env["APP_ACCESS_PASSWORD"];
    if (!expected) return { ok: false as const };
    return { ok: matches(data.password, expected) };
  });
