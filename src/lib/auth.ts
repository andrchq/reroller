import bcrypt from "bcryptjs";
import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

const cookieName = "reroller_session";

function shouldUseSecureCookie() {
  if (process.env.AUTH_COOKIE_SECURE) {
    return process.env.AUTH_COOKIE_SECURE === "true";
  }
  return process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") ?? process.env.NODE_ENV === "production";
}

function sign(value: string) {
  const secret = process.env.AUTH_SECRET ?? process.env.APP_SECRET_KEY;
  if (!secret) {
    throw new Error("AUTH_SECRET or APP_SECRET_KEY is required");
  }
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string) {
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 14;
  const value = `${userId}.${expiresAt}`;
  const jar = await cookies();
  jar.set(cookieName, `${value}.${sign(value)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    expires: new Date(expiresAt),
    path: "/",
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(cookieName);
}

export async function getSessionUser() {
  const jar = await cookies();
  const raw = jar.get(cookieName)?.value;
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresAtRaw, signature] = parts;
  const value = `${userId}.${expiresAtRaw}`;
  if (signature !== sign(value) || Number(expiresAtRaw) < Date.now()) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
