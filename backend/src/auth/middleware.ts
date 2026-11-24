import { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma";
import { verifyJwt } from "./google";

// Extend Express Request to include the authenticated user.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        googleId: string;
        name: string;
        email: string;
        avatarUrl: string | null;
      };
    }
  }
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

  req.user = {
    id: user.id,
    googleId: user.googleId,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };

  next();
}
