function firstHeader(value) {
  if (Array.isArray(value)) return value[0] ?? "";
  return String(value ?? "")
    .split(",")[0]
    .trim();
}

/**
 * Build the absolute URL that appears in invitation and password-reset emails.
 *
 * An explicit TASKLY_PUBLIC_URL always wins. When it is absent, forwarded
 * headers are only trusted if TASKLY_TRUST_PROXY=1 (set this on Render), so a
 * deployment behind an HTTPS proxy still generates https:// links instead of
 * http://127.0.0.1:10000 links.
 */
export function publicBase(
  req,
  { configuredUrl = "", trustProxy = false, fallbackHost = "" } = {},
) {
  const configured = String(configuredUrl).trim().replace(/\/+$/, "");
  if (configured) return configured;

  const headers = req?.headers ?? {};
  const rawProto = trustProxy ? firstHeader(headers["x-forwarded-proto"]) : "";
  const proto = rawProto === "https" || rawProto === "http" ? rawProto : "http";
  const rawHost = trustProxy
    ? firstHeader(headers["x-forwarded-host"]) || firstHeader(headers.host)
    : firstHeader(headers.host);
  const host = String(rawHost || fallbackHost || "127.0.0.1").replace(
    /[^\w.:-]/g,
    "",
  );

  return `${proto}://${host}`;
}
