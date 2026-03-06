import { describe, expect, it } from 'vitest';
import {
  COLLECTION_TYPES,
  CONTENT_SOURCES,
  EMPTY_CURSOR,
  SYNC_MODES,
  VALID_SOURCE_COLLECTIONS,
  isValidSourceCollection,
} from '../types';

describe('isValidSourceCollection', () => {
  it('accepts youtube/likes', () => {
    expect(isValidSourceCollection('youtube', 'likes')).toBe(true);
  });

  it('accepts x/likes', () => {
    expect(isValidSourceCollection('x', 'likes')).toBe(true);
  });

  it('accepts x/bookmarks', () => {
    expect(isValidSourceCollection('x', 'bookmarks')).toBe(true);
  });

  it('rejects youtube/bookmarks', () => {
    expect(isValidSourceCollection('youtube', 'bookmarks')).toBe(false);
  });
});

describe('VALID_SOURCE_COLLECTIONS', () => {
  it('contains exactly 3 valid combinations', () => {
    expect(VALID_SOURCE_COLLECTIONS).toHaveLength(3);
  });
});

describe('enums', () => {
  it('has expected content sources', () => {
    expect(CONTENT_SOURCES).toEqual(['youtube', 'x']);
  });

  it('has expected collection types', () => {
    expect(COLLECTION_TYPES).toEqual(['likes', 'bookmarks']);
  });

  it('has expected sync modes', () => {
    expect(SYNC_MODES).toEqual(['quick', 'extended', 'full']);
  });
});

describe('EMPTY_CURSOR', () => {
  it('has null token and reachedEnd false', () => {
    expect(EMPTY_CURSOR).toEqual({ token: null, reachedEnd: false });
  });
});
