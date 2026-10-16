export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET must be a private random value of at least 32 characters",
    );
  }
  return secret;
}

export function getJwtExpirationMinutes(): number {
  const value = process.env.JWT_EXPIRES_IN_MINUTES ?? "480";
  const minutes = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(minutes) || minutes <= 0) {
    throw new Error("JWT_EXPIRES_IN_MINUTES must be a positive whole number");
  }
  return minutes;
}

export default () => ({
  jwt: {
    secret: getJwtSecret(),
    expiresIn: `${getJwtExpirationMinutes()}m`,
  },
});
