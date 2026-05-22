import { describe, expect, it } from 'vitest';
import { parseArtistTitleFromDisplayTitle } from './spotify-search-track';

describe('parseArtistTitleFromDisplayTitle', () => {
  it('splits on first " - "', () => {
    expect(parseArtistTitleFromDisplayTitle('The Beatles - Let It Be')).toEqual({
      artist: 'The Beatles',
      title: 'Let It Be',
    });
  });

  it('returns null when separator missing', () => {
    expect(parseArtistTitleFromDisplayTitle('Let It Be')).toBeNull();
  });
});
