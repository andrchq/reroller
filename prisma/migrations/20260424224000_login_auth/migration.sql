-- Rename email-based auth to login-based auth.
ALTER TABLE "User" RENAME COLUMN "email" TO "login";
ALTER INDEX IF EXISTS "User_email_key" RENAME TO "User_login_key";
