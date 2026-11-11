const DEVELOPMENT_SECRET = "goodspend-default-dev-secret-key-32-chars-min";
export function getJwtSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (
    process.env.NODE_ENV === "production" &&
    (!secret || Buffer.byteLength(secret) < 32 || secret === DEVELOPMENT_SECRET)
  )
    throw new Error(
      "JWT_SECRET must be a private secret of at least 32 bytes in production.",
    );
  return new TextEncoder().encode(secret || DEVELOPMENT_SECRET);
}
