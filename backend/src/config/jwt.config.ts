export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET must be a private random value of at least 32 characters",
    );
  }
  return secret;
}

export default () => ({ jwt: { secret: getJwtSecret(), expiresIn: "8h" } });
