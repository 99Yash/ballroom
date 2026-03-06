import { describe, expect, it } from 'vitest';
import type { YouTubeVideo } from '~/lib/youtube';
import type { XTweet } from '~/lib/x';
import { normalizeYouTubeVideo } from '../normalize';
import { normalizeXTweet } from '../x-provider';

describe('normalizeYouTubeVideo', () => {
  const baseVideo: YouTubeVideo = {
    youtubeId: 'abc123',
    title: 'Test Video',
    description: 'A test video description',
    thumbnailUrl: 'https://i.ytimg.com/vi/abc123/default.jpg',
    channelName: 'Test Channel',
    channelId: 'UC_test',
    publishedAt: new Date('2025-01-01T00:00:00Z'),
  };

  it('maps all fields correctly', () => {
    const result = normalizeYouTubeVideo(baseVideo);
    expect(result).toEqual({
      externalId: 'abc123',
      title: 'Test Video',
      description: 'A test video description',
      thumbnailUrl: 'https://i.ytimg.com/vi/abc123/default.jpg',
      authorName: 'Test Channel',
      authorId: 'UC_test',
      publishedAt: new Date('2025-01-01T00:00:00Z'),
      providerMetadata: null,
    });
  });

  it('coerces empty description to null', () => {
    const result = normalizeYouTubeVideo({ ...baseVideo, description: '' });
    expect(result.description).toBeNull();
  });

  it('coerces empty thumbnailUrl to null', () => {
    const result = normalizeYouTubeVideo({ ...baseVideo, thumbnailUrl: '' });
    expect(result.thumbnailUrl).toBeNull();
  });

  it('coerces empty channelName to null', () => {
    const result = normalizeYouTubeVideo({ ...baseVideo, channelName: '' });
    expect(result.authorName).toBeNull();
  });

  it('coerces empty channelId to null', () => {
    const result = normalizeYouTubeVideo({ ...baseVideo, channelId: '' });
    expect(result.authorId).toBeNull();
  });
});

describe('normalizeXTweet', () => {
  const baseTweet: XTweet = {
    id: 'tweet123',
    text: 'This is a test tweet',
    authorId: 'user456',
    authorName: 'Test User',
    authorUsername: 'testuser',
    authorProfileImageUrl: 'https://pbs.twimg.com/profile_images/test.jpg',
    createdAt: new Date('2025-06-01T12:00:00Z'),
    conversationId: 'conv789',
    lang: 'en',
  };

  it('maps all fields correctly', () => {
    const result = normalizeXTweet(baseTweet);
    expect(result).toEqual({
      externalId: 'tweet123',
      title: 'This is a test tweet',
      description: 'This is a test tweet',
      thumbnailUrl: 'https://pbs.twimg.com/profile_images/test.jpg',
      authorName: 'Test User',
      authorId: 'user456',
      publishedAt: new Date('2025-06-01T12:00:00Z'),
      providerMetadata: {
        conversationId: 'conv789',
        lang: 'en',
        username: 'testuser',
      },
    });
  });

  it('truncates long text to 200 chars for title', () => {
    const longText = 'a'.repeat(250);
    const result = normalizeXTweet({ ...baseTweet, text: longText });
    expect(result.title).toHaveLength(200);
    expect(result.title).toBe('a'.repeat(197) + '...');
    expect(result.description).toBe(longText);
  });

  it('does not truncate text at exactly 200 chars', () => {
    const exact = 'b'.repeat(200);
    const result = normalizeXTweet({ ...baseTweet, text: exact });
    expect(result.title).toBe(exact);
  });

  it('falls back to @username when authorName is empty', () => {
    const result = normalizeXTweet({ ...baseTweet, authorName: '' });
    expect(result.authorName).toBe('@testuser');
  });

  it('handles null createdAt', () => {
    const result = normalizeXTweet({ ...baseTweet, createdAt: null });
    expect(result.publishedAt).toBeNull();
  });

  it('handles null profileImageUrl', () => {
    const result = normalizeXTweet({
      ...baseTweet,
      authorProfileImageUrl: null,
    });
    expect(result.thumbnailUrl).toBeNull();
  });
});
