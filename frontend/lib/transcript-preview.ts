const normalizeTranscriptChunk = (value: string) =>
  value.replace(/\u00a0/g, " ").replace(/[^\S\n]+/g, " ");

export const mergeTranscriptPreviewText = (current: string, incoming: string) => {
  const previous = normalizeTranscriptChunk(current);
  const nextChunk = normalizeTranscriptChunk(incoming);

  if (!nextChunk) {
    return previous;
  }

  if (!previous) {
    return nextChunk.trimStart();
  }

  if (nextChunk === previous) {
    return previous;
  }

  if (nextChunk.startsWith(previous)) {
    return nextChunk;
  }

  if (previous.startsWith(nextChunk) || previous.endsWith(nextChunk)) {
    return previous;
  }

  if (/\s$/.test(previous) && /^\s/.test(nextChunk)) {
    return `${previous}${nextChunk.replace(/^\s+/, "")}`;
  }

  return `${previous}${nextChunk}`;
};

export const finalizeTranscriptPreviewText = (value: string) =>
  normalizeTranscriptChunk(value).trim();
