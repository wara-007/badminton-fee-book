export type VoicePlayer = {
  id: string;
  name: string;
};

export type VoicePlayerMatchResult =
  | { status: 'matched'; player: VoicePlayer }
  | { status: 'ambiguous'; spokenText: string; candidates: VoicePlayer[] }
  | { status: 'unmatched'; spokenText: string };

const VOICE_ALIASES: Record<string, string> = {
  king: 'คิง',
  kevin: 'เควิน',
};

const THAI_INITIAL_GROUPS = new Set([
  'กร',
  'กล',
  'กว',
  'ขร',
  'ขล',
  'ขว',
  'คร',
  'คล',
  'คว',
  'ตร',
  'ปร',
  'ปล',
  'พร',
  'พล',
  'ผล',
  'ทร',
  'ดร',
  'บร',
  'บล',
  'ฟร',
  'ฟล',
  'ศร',
  'สร',
  'หง',
  'หญ',
  'หน',
  'หม',
  'หย',
  'หร',
  'หล',
  'หว',
  'อย',
]);

export function normalizeVoiceText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('th-TH')
    .replace(/[.,!?;:()[\]{}'"“”‘’/_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => VOICE_ALIASES[word] ?? word)
    .join(' ');
}

function getEditDistance(left: string, right: string): number {
  const previousRow = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const currentRow = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      currentRow.push(
        Math.min(
          currentRow[rightIndex] + 1,
          previousRow[rightIndex + 1] + 1,
          previousRow[rightIndex] +
            (left[leftIndex] === right[rightIndex] ? 0 : 1),
        ),
      );
    }
    previousRow.splice(0, previousRow.length, ...currentRow);
  }

  return previousRow[right.length];
}

function normalizeThaiSoundText(value: string): string {
  return value
    .replace(/[\u0E48-\u0E4B]/g, '')
    .replace(/.\u0E4C/g, '');
}

function getFirstThaiConsonant(value: string): string {
  return value.match(/[ก-ฮ]/)?.[0] ?? value[0] ?? '';
}

function getThaiInitialGroups(value: string): string[] {
  const groups: string[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (!/[ก-ฮ]/.test(character)) {
      continue;
    }

    const pair = `${character}${value[index + 1] ?? ''}`;
    const isAtStart = index === 0;
    const hasLeadingVowel = /[เแโใไ]/.test(value[index - 1] ?? '');
    const isKnownInitialPair = THAI_INITIAL_GROUPS.has(pair);
    if (!isAtStart && !hasLeadingVowel && !isKnownInitialPair) {
      continue;
    }

    groups.push(isKnownInitialPair ? pair : character);
    if (isKnownInitialPair) {
      index += 1;
    }
  }

  return groups;
}

function getFirstThaiInitialGroup(value: string): string {
  return getThaiInitialGroups(value)[0] ?? getFirstThaiConsonant(value);
}

function getMatchingCharacterCount(left: string, right: string): number {
  const previousRow = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const currentRow = [0];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      currentRow.push(
        left[leftIndex] === right[rightIndex]
          ? previousRow[rightIndex] + 1
          : Math.max(currentRow[rightIndex], previousRow[rightIndex + 1]),
      );
    }
    previousRow.splice(0, previousRow.length, ...currentRow);
  }

  return previousRow[right.length];
}

function getFuzzyCandidates(
  spokenText: string,
  players: Array<{ player: VoicePlayer; normalizedName: string }>,
) {
  return players
    .filter(
      ({ normalizedName }) =>
        normalizedName.length > 1 || spokenText.length === 1,
    )
    .map(({ player, normalizedName }) => {
      const distance = getEditDistance(spokenText, normalizedName);
      const maxLength = Math.max(spokenText.length, normalizedName.length);
      const soundText = normalizeThaiSoundText(spokenText);
      const soundName = normalizeThaiSoundText(normalizedName);
      const matchingCharacterCount = getMatchingCharacterCount(
        spokenText,
        normalizedName,
      );
      const matchingCharacterThreshold = normalizedName.length <= 3 ? 2 : 3;
      const firstInitialGroup = getFirstThaiInitialGroup(normalizedName);
      const spokenInitialGroups = getThaiInitialGroups(spokenText);
      return {
        player,
        distance,
        similarity: maxLength === 0 ? 1 : 1 - distance / maxLength,
        isContained:
          spokenText.includes(normalizedName) ||
          normalizedName.includes(spokenText),
        hasSameThaiSound: soundText === soundName,
        hasEnoughMatchingCharacters:
          matchingCharacterCount >= matchingCharacterThreshold,
        hasMatchingFirstConsonant:
          firstInitialGroup !== '' &&
          spokenInitialGroups.includes(firstInitialGroup),
      };
    })
    .filter(
      ({
        similarity,
        distance,
        isContained,
        hasSameThaiSound,
        hasEnoughMatchingCharacters,
        hasMatchingFirstConsonant,
      }) =>
        hasMatchingFirstConsonant &&
        (isContained ||
          hasSameThaiSound ||
          hasEnoughMatchingCharacters ||
          similarity >= 0.5 ||
          distance <= 1),
    )
    .sort(
      (a, b) =>
        Number(b.isContained) - Number(a.isContained) ||
        Number(b.hasSameThaiSound) - Number(a.hasSameThaiSound) ||
        Number(b.hasEnoughMatchingCharacters) -
          Number(a.hasEnoughMatchingCharacters) ||
        b.similarity - a.similarity ||
        a.distance - b.distance,
    );
}

function splitJoinedPlayerNames(
  spokenText: string,
  players: Array<{ player: VoicePlayer; normalizedName: string }>,
): VoicePlayer[] | null {
  const memo = new Map<string, VoicePlayer[] | null>();

  function findSplit(remainingText: string): VoicePlayer[] | null {
    if (!remainingText) {
      return [];
    }
    if (memo.has(remainingText)) {
      return memo.get(remainingText) ?? null;
    }

    const possibleSplits = players
      .filter(({ normalizedName }) => remainingText.startsWith(normalizedName))
      .map(({ player, normalizedName }) => {
        const rest = findSplit(remainingText.slice(normalizedName.length));
        return rest ? [player, ...rest] : null;
      })
      .filter((split): split is VoicePlayer[] => Boolean(split))
      .sort((left, right) => right.length - left.length);
    const bestSplit = possibleSplits[0] ?? null;
    memo.set(remainingText, bestSplit);
    return bestSplit;
  }

  return findSplit(spokenText);
}

function findContainedPlayers(
  spokenText: string,
  players: Array<{ player: VoicePlayer; normalizedName: string }>,
): VoicePlayer[] {
  return players
    .map(({ player, normalizedName }) => ({
      player,
      index: spokenText.indexOf(normalizedName),
      nameLength: normalizedName.length,
    }))
    .filter(
      ({ index, nameLength }) =>
        index >= 0 && (nameLength > 1 || spokenText.length === 1),
    )
    .sort(
      (left, right) =>
        left.index - right.index || right.nameLength - left.nameLength,
    )
    .filter(
      ({ player }, index, matches) =>
        matches.findIndex((match) => match.player.id === player.id) === index,
    )
    .map(({ player }) => player);
}

function mergeCandidatePlayers(
  ...candidateGroups: VoicePlayer[][]
): VoicePlayer[] {
  return candidateGroups
    .flat()
    .filter(
      (player, index, allPlayers) =>
        allPlayers.findIndex(
          (currentPlayer) => currentPlayer.id === player.id,
        ) === index,
    );
}

function findFuzzySubstringPlayers(
  spokenText: string,
  players: Array<{ player: VoicePlayer; normalizedName: string }>,
): VoicePlayer[] {
  return players
    .map(({ player, normalizedName }) => {
      const nameLength = normalizedName.length;
      if (nameLength <= 1) {
        return null;
      }
      const firstInitialGroup = getFirstThaiInitialGroup(normalizedName);
      const soundName = normalizeThaiSoundText(normalizedName);
      let bestDistance = Number.POSITIVE_INFINITY;
      let bestMatchingCharacterCount = 0;
      for (let start = 0; start < spokenText.length; start += 1) {
        for (const windowLength of [nameLength - 1, nameLength, nameLength + 1]) {
          const substring = spokenText.slice(start, start + windowLength);
          const soundSubstring = normalizeThaiSoundText(substring);
          if (
            substring &&
            getFirstThaiInitialGroup(substring) === firstInitialGroup
          ) {
            bestDistance = Math.min(
              bestDistance,
              getEditDistance(soundSubstring, soundName),
            );
            bestMatchingCharacterCount = Math.max(
              bestMatchingCharacterCount,
              getMatchingCharacterCount(soundSubstring, soundName),
            );
          }
        }
      }
      const matchingCharacterThreshold = soundName.length <= 3 ? 2 : 3;
      return bestDistance <= 1 &&
        bestMatchingCharacterCount >= matchingCharacterThreshold
        ? { player, bestDistance, bestMatchingCharacterCount }
        : null;
    })
    .filter(
      (
        match,
      ): match is {
        player: VoicePlayer;
        bestDistance: number;
        bestMatchingCharacterCount: number;
      } => Boolean(match),
    )
    .sort(
      (left, right) =>
        left.bestDistance - right.bestDistance ||
        right.bestMatchingCharacterCount - left.bestMatchingCharacterCount,
    )
    .map(({ player }) => player);
}

export function matchSpokenPlayerNames(
  transcript: string,
  players: VoicePlayer[],
): VoicePlayerMatchResult[] {
  const normalizedTranscript = normalizeVoiceText(transcript);
  if (!normalizedTranscript) {
    return [];
  }

  const normalizedPlayers = players
    .map((player) => ({
      player,
      normalizedName: normalizeVoiceText(player.name),
    }))
    .filter(({ normalizedName }) => normalizedName)
    .sort((a, b) => a.normalizedName.length - b.normalizedName.length);
  const detectedInitialGroups = getThaiInitialGroups(normalizedTranscript);

  const results: VoicePlayerMatchResult[] = [];
  let remainingText = normalizedTranscript;

  while (remainingText) {
    const [spokenChunk, ...remainingChunks] = remainingText.split(' ');
    const joinedPlayers = splitJoinedPlayerNames(
      spokenChunk,
      normalizedPlayers,
    );
    if (joinedPlayers && joinedPlayers.length > 1) {
      results.push(
        ...joinedPlayers.map(
          (player): VoicePlayerMatchResult => ({ status: 'matched', player }),
        ),
      );
      remainingText = remainingChunks.join(' ');
      continue;
    }

    const containedPlayers = findContainedPlayers(
      spokenChunk,
      normalizedPlayers,
    );
    if (containedPlayers.length > 1) {
      const substringFuzzyPlayers = findFuzzySubstringPlayers(
        spokenChunk,
        normalizedPlayers,
      );
      results.push({
        status: 'ambiguous',
        spokenText: spokenChunk,
        candidates: mergeCandidatePlayers(
          containedPlayers,
          substringFuzzyPlayers,
        ),
      });
      remainingText = remainingChunks.join(' ');
      continue;
    }

    const exactPlayer = normalizedPlayers.find(
      ({ normalizedName }) =>
        remainingText === normalizedName ||
        remainingText.startsWith(`${normalizedName} `) ||
        (/[\u0E00-\u0E7F]/.test(normalizedName) &&
          remainingText.startsWith(normalizedName)),
    );

    if (exactPlayer) {
      results.push({ status: 'matched', player: exactPlayer.player });
      remainingText = remainingText
        .slice(exactPlayer.normalizedName.length)
        .trim();
      continue;
    }

    const [spokenText, ...rest] = remainingText.split(' ');
    const partialCandidates = normalizedPlayers
      .filter(({ normalizedName }) => normalizedName.includes(spokenText))
      .map(({ player }) => player);
    const fuzzyCandidates = getFuzzyCandidates(spokenText, normalizedPlayers);
    const bestFuzzyCandidate = fuzzyCandidates[0];
    const secondFuzzyCandidate = fuzzyCandidates[1];
    const hasClearFuzzyWinner =
      bestFuzzyCandidate &&
      !bestFuzzyCandidate.hasSameThaiSound &&
      (!secondFuzzyCandidate ||
        bestFuzzyCandidate.similarity - secondFuzzyCandidate.similarity >=
          0.25);

    results.push(
      partialCandidates.length === 1
        ? { status: 'matched', player: partialCandidates[0] }
        : partialCandidates.length > 1
          ? { status: 'ambiguous', spokenText, candidates: partialCandidates }
          : hasClearFuzzyWinner
            ? { status: 'matched', player: bestFuzzyCandidate.player }
            : fuzzyCandidates.length > 0
              ? {
                  status: 'ambiguous',
                  spokenText,
                  candidates: fuzzyCandidates.map(({ player }) => player),
                }
              : { status: 'unmatched', spokenText },
    );
    remainingText = rest.join(' ');
  }

  if (process.env.NODE_ENV === 'development') console.info('[voice-match]', {
    transcript,
    normalizedTranscript,
    detectedInitialGroups,
    availablePlayers: normalizedPlayers.map(({ player, normalizedName }) => ({
      id: player.id,
      name: player.name,
      normalizedName,
      firstInitialGroup: getFirstThaiInitialGroup(normalizedName),
    })),
    results: results.map((result) =>
      result.status === 'matched'
        ? { status: result.status, name: result.player.name }
        : result.status === 'ambiguous'
          ? {
              status: result.status,
              spokenText: result.spokenText,
              candidates: result.candidates.map((player) => player.name),
            }
          : { status: result.status, spokenText: result.spokenText },
    ),
  });

  return results;
}
