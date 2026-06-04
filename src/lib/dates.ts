export type ParsedHistoryDate = {
  ordinal: number;
  dateText: string;
  eventText: string;
  isStrong: boolean;
};

const HEADER_PATTERN = /^(?:strong>)?дата\s*\|\|\|\s*подія\s*$/i;

export function parseDatesDump(text: string): ParsedHistoryDate[] {
  const lines = text.split(/\r?\n/);
  const entries: ParsedHistoryDate[] = [];
  let ordinal = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (HEADER_PATTERN.test(line)) {
      continue;
    }

    const separatorIndex = line.indexOf("|||");
    if (separatorIndex === -1) {
      continue;
    }

    const leftPart = line.slice(0, separatorIndex).trim();
    const eventText = line.slice(separatorIndex + 3).trim();
    if (!leftPart || !eventText) {
      continue;
    }

    const isStrong = leftPart.startsWith("strong>");
    const dateText = isStrong
      ? leftPart.slice("strong>".length).trim()
      : leftPart;

    if (!dateText) {
      continue;
    }

    ordinal += 1;
    entries.push({
      ordinal,
      dateText,
      eventText,
      isStrong,
    });
  }

  return entries;
}

export function displayDateText(dateText: string) {
  return dateText.startsWith("strong>")
    ? dateText.slice("strong>".length).trim()
    : dateText;
}
