const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const prefix = `${encodeURIComponent(name)}=`;
  const parts = document.cookie.split(";");

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }

  return null;
}

export function setCookieValue(name: string, value: string) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}

export function removeCookieValue(name: string) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${encodeURIComponent(name)}=; path=/; max-age=0; samesite=lax`;
}
