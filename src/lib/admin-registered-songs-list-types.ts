export type AdminRegisteredSongListItem = {
  id: string;
  main_artist: string | null;
  song_title: string | null;
  display_title: string | null;
  style: string | null;
  genres: string[];
  vocal: string | null;
  created_at: string | null;
  original_release_date: string | null;
  catalog_published_at: string | null;
  catalog_scope: string | null;
  /** 代表 YouTube ID（songs.music8_video_id、無ければ song_videos） */
  music8_video_id: string | null;
  music8_song_id: number | null;
  has_intro: boolean;
  intro_preview: string | null;
  spotify_images: string | null;
};

export type AdminRegisteredSongsListResponse = {
  items: AdminRegisteredSongListItem[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  scope: string;
  q: string;
};
