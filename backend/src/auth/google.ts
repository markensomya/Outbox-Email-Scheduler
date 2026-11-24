import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { logger } from "../utils/logger";

/**
 * Google OAuth 2.0 configuration.
 *
 * Flow:
 * 1. User clicks "Sign in with Google" → redirected to Google consent.
 * 2. Google redirects back to /api/auth/google/callback with a code.
 * 3. Passport exchanges the code for a profile (id, name, email, avatar).
 * 4. We upsert the user in PostgreSQL.
 * 5. We issue a JWT and set it as an HTTP-only cookie.
 */

export function configureGoogleAuth(): void {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.googleClientId,
        clientSecret: env.googleClientSecret,
        callbackURL: env.googleCallbackUrl,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const googleId = profile.id;
          const email = profile.emails?.[0]?.value || "";
          const name = profile.displayName || email;
          const avatarUrl = profile.photos?.[0]?.value || null;

          const user = await prisma.user.upsert({
            where: { googleId },
            create: { googleId, name, email, avatarUrl },
            update: { name, avatarUrl },
          });

          return done(null, user);
        } catch (err) {
          logger.error("[google] OAuth strategy error", { error: (err as Error).message });
          return done(err as Error, undefined);
        }
      },
    ),
  );

  passport.serializeUser((user, done) => {
    done(null, (user as { id: string }).id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await prisma.user.findUnique({ where: { id } });
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });
}

/** Issue a signed JWT for an authenticated user. */
export function issueJwt(userId: string): string {
  return jwt.sign({ sub: userId }, env.jwtSecret, {
    // Cast to work around @types/jsonwebtoken v9 strict StringValue type
    expiresIn: env.jwtExpiresIn as unknown as jwt.SignOptions["expiresIn"],
  });
}

/** Verify a JWT and return the user id (or null). */
export function verifyJwt(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret) as { sub: string };
    return payload.sub;
  } catch {
    return null;
  }
}
