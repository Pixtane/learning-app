const UKRAINIAN_VOWELS = new Set([
  "а",
  "е",
  "є",
  "и",
  "і",
  "ї",
  "о",
  "у",
  "ю",
  "я",
]);

const WORD_PATTERN = /^[\p{L}'’ʼ`-]+$/u;

export type ParsedStressWord = {
  sourceText: string;
  displayWord: string;
  stressPositions: number[];
};

export type StressSourceParts = {
  testedText: string;
  trailingText: string;
};

export function isUkrainianVowel(character: string): boolean {
  return UKRAINIAN_VOWELS.has(character.toLocaleLowerCase("uk-UA"));
}

export function parseStressWord(rawValue: string): ParsedStressWord {
  const sourceText = rawValue.trim();

  if (!sourceText) {
    throw new Error("Слово не може бути порожнім.");
  }

  const { testedText } = splitStressSourceText(sourceText);

  if (!WORD_PATTERN.test(testedText)) {
    throw new Error(
      "Перше слово має містити лише літери, апостроф та дефіс."
    );
  }

  const displayCharacters: string[] = [];
  const stressPositions: number[] = [];

  for (const character of testedText) {
    const normalizedCharacter = character.toLocaleLowerCase("uk-UA");
    const nextIndex = displayCharacters.length;

    if (character !== normalizedCharacter && !isUkrainianVowel(character)) {
      throw new Error(
        "Великими літерами можна позначати лише наголошені голосні."
      );
    }

    if (character !== normalizedCharacter && isUkrainianVowel(character)) {
      stressPositions.push(nextIndex);
    }

    displayCharacters.push(normalizedCharacter);
  }

  if (stressPositions.length === 0) {
    throw new Error(
      "Позначте наголос великою голосною літерою, наприклад: завдАння."
    );
  }

  return {
    sourceText,
    displayWord: displayCharacters.join(""),
    stressPositions,
  };
}

export function splitStressSourceText(sourceText: string): StressSourceParts {
  const trimmedText = sourceText.trim();
  const match = trimmedText.match(/^([\p{L}'’ʼ`-]+)([\s\S]*)$/u);

  if (!match) {
    throw new Error("Запис має починатися зі слова.");
  }

  return {
    testedText: match[1],
    trailingText: match[2] ?? "",
  };
}

export function splitImportedWords(text: string): string[] {
  return text
    .split(/[\n,;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function serializeStressPositions(stressPositions: number[]): string {
  return JSON.stringify(stressPositions);
}

export function deserializeStressPositions(value: string): number[] {
  const parsedValue = JSON.parse(value) as unknown;

  if (!Array.isArray(parsedValue)) {
    return [];
  }

  return parsedValue
    .filter((item): item is number => typeof item === "number")
    .sort((left, right) => left - right);
}

export function formatWordWithStress(
  displayWord: string,
  stressPositions: number[]
): string {
  return [...displayWord]
    .map((character, index) =>
      stressPositions.includes(index)
        ? character.toLocaleUpperCase("uk-UA")
        : character
    )
    .join("");
}

export function formatSourceTextWithStress(
  sourceText: string,
  displayWord: string,
  stressPositions: number[]
): string {
  const { trailingText } = splitStressSourceText(sourceText);

  return `${formatWordWithStress(displayWord, stressPositions)}${trailingText}`;
}

export function isCorrectStressPick(
  stressPositions: number[],
  chosenIndex: number
): boolean {
  return stressPositions.includes(chosenIndex);
}
