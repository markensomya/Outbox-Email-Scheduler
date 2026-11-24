import { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma";
import { verifyJwt } from "./google";

/** Type for the authenticated user attached to the request. */
export interface AuthUser {
  id: string;
  googleId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

/** Extract the authenticated user from a request (type-safe). */
export function getAuthUser(req: Request): AuthUser {
  return req.user as unknown as AuthUser;
}

/**
 * Auth middleware: verifies the JWT from the HTTP-only cookie
 * (or Authorization header fallback) and attaches the user to the request.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Read token from cookie, then fall back to Bearer header.
  let token: string | undefined =
    (req.cookies?.session as string | undefined) || undefined;

  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const userId = verifyJwt(token);
  if (!userId) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  (req as unknown as { user: AuthUser }).user = {
    id: user.id,
    googleId: user.googleId,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };

  next();
}
