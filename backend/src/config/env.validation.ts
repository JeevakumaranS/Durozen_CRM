export function validateEnvironment(config: Record<string, unknown>) {
  if (typeof config.DATABASE_URL !== "string" || !config.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  if (
    typeof config.JWT_SECRET !== "string" ||
    config.JWT_SECRET.length < 32 ||
    config.JWT_SECRET === "replace-with-a-long-random-secret"
  ) {
    throw new Error(
      "JWT_SECRET must be a private random value of at least 32 characters",
    );
  }

  return config;
}
