import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import {
  getArtistAndSong,
  getMainArtist,
  getArtistDisplayString,
  parseArtistTitleFromDescription,
} from '@/lib/format-song-display';
import { getVideoSnippet } from '@/lib/youtube-search';
import { getGeminiModel, logGeminiUsage } from '@/lib/gemini';
import { persistGeminiUsageLog } from '@/lib/gemini-usage-log';
import { createAdminClient } from '@/lib/supabase/admin';
import { upsertSongAndVideo } from '@/lib/song-entities';
import {
  COMMENT_PACK_MAX_FREE_COMMENTS,
  COMMENT_PACK_NEW_RELEASE_DISCLAIMER,
  getStoredCommentPackByVideoId,
  getStoredNewReleaseCommentPack,
  insertTidbit,
} from '../../../../lib/song-tidbits';

export const dynamic = 'force-dynamic';

/** YouTube 動画の公開日がこの日数以内なら「新曲」とみなし、基本コメントのみ出す */
const NEW_RELEASE_DAYS = 30;

function isPublishedWithinLastDays(publishedAtIso: string | undefined, days: number): boolean {
  if (!publishedAtIso || typeof publishedAtIso !== 'string') return false;
  const d = new Date(publishedAtIso.trim());
  if (Number.isNaN(d.getTime())) return false;
  const now = Date.now();
  const diffMs = now - d.getTime();
  if (diffMs < 0) return false;
  return diffMs <= days * 24 * 60 * 60 * 1000;
}

/**
 * 曲ごとのコメントパック生成API
 * - 基本コメント1本 + 自由コメント最大3本（観点を変えて）をまとめて生成する
 * - 動画公開から30日以内は「新曲」とみなし、基本コメントのみ（末尾に注釈）。自由3本は生成しない
 * - 同一動画は song_tidbits から再利用（新曲は注釈付き基本のみキャッシュ、それ以外は4本そろいでキャッシュ）
 * - COMMENT_PACK_SKIP_CACHE=1 で常に新規生成
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
    if (!videoId) {
      return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
    }

    const supabase = await createClient();

    const [oembed, snippet] = await Promise.all([fetchOEmbed(videoId), getVideoSnippet(videoId)]);

    let title = oembed?.title ?? snippet?.title ?? videoId;
    let authorName = oembed?.author_name;
    let { artist, artistDisplay, song } = getArtistAndSong(title, authorName, {
      videoDescription: snippet?.description ?? null,
    });

    if (!artistDisplay || !artist) {
      if (snippet?.description) {
        const fromDesc = parseArtistTitleFromDescription(snippet.description);
        if (fromDesc) {
          artist = getMainArtist(fromDesc.artist);
          artistDisplay = getArtistDisplayString(fromDesc.artist);
          song = fromDesc.song;
        } else {
          if (!artist && snippet.channelTitle) {
            artist = snippet.channelTitle.trim();
            artistDisplay = artist;
          }
          if (!song && snippet.title) song = snippet.title.trim();
        }
      }
    }

    const isNewRelease = isPublishedWithinLastDays(snippet?.publishedAt, NEW_RELEASE_DAYS);

    // songs / song_videos 登録＋ song_id
    let songId: string | null = null;
    try {
      songId = await upsertSongAndVideo({
        supabase,
        videoId,
        mainArtist: artist ?? authorName ?? null,
        songTitle: song ?? title,
        variant: 'tidbit',
      });
    } catch (e) {
      console.error('[api/ai/comment-pack] upsertSongAndVideo', e);
    }

    const skipCache = process.env.COMMENT_PACK_SKIP_CACHE === '1';
    if (!skipCache) {
      const reader = createAdminClient() ?? supabase;
      if (isNewRelease) {
        const nrCached = await getStoredNewReleaseCommentPack(reader, videoId);
        if (nrCached) {
          return NextResponse.json({
            songId,
            videoId,
            baseComment: nrCached.baseComment,
            freeComments: [],
            source: 'library',
            newReleaseOnly: true,
          });
        }
      } else {
        const cached = await getStoredCommentPackByVideoId(reader, videoId);
        if (cached) {
          return NextResponse.json({
            songId,
            videoId,
            baseComment: cached.baseComment,
            freeComments: [...cached.freeComments],
            source: 'library',
          });
        }
      }
    }

    const model = getGeminiModel();
    if (!model) {
      return NextResponse.json(
        { error: 'Gemini is not configured' },
        { status: 503 },
      );
    }

    const currentYear = new Date().getFullYear();
    const artistLabel = artistDisplay || artist || authorName || 'Unknown Artist';
    const songLabel = song || title;
    const rawYouTubeTitle = title;

    const metaLockBlock = `【メタデータの前提（厳守）】
・YouTube 動画タイトル（原文）: ${rawYouTubeTitle}
・ここで用いるアーティスト名: ${artistLabel}
・ここで用いる曲名: ${songLabel}
・アーティスト名と曲名の上下関係を入れ替えたり、「別の架空バンド／別タイトルの曲」として語らないこと。
・タイトル・チャンネル名と矛盾するリリース年・アルバム名・編成・未来の年号は書かない。不明・不確実ならその一句を省くか「〜として知られる」など弱い表現にとどめる。
・本APIは Music8 等の外部楽曲DBを参照していません。根拠のない固有名・年号を作らないこと。`;

    // 1. 基本コメント（/commentary と似た役割だが、このAPI専用に少し短めに生成）
    const basePromptTail = isNewRelease
      ? `・この動画は公開から約1ヶ月以内の新曲扱いです。周辺情報が不十分な可能性があるため、断定を避け、分かる範囲の紹介にとどめてください（推測や詳細な背景説明は控えめに）。
・この後に自由コメントは出しません。ここ1本で完結する基本紹介にしてください。`
      : `・このプロンプトで書くのは「基本コメント」です。あとで別に3本の自由コメントを出すので、ここでは曲の「全体像の紹介」に集中してください。`;

    const basePrompt = `選曲アナウンスの直後に表示する曲の基本解説を1本だけ書いてください。現在は${currentYear}年です。
${metaLockBlock}

・80〜150文字程度、日本語、です・ます調。
・リリース年、収録アルバム名（分かれば）、この曲のテーマや雰囲気を1文で。
・バンド名とリリース年から体制変更の特筆事項（故メンバーの逝去・活動休止・新ボーカル加入など）を知っている場合は、簡潔にひと言触れること。例：Linkin Parkの2024年曲なら、2017年チェスター・ベニントン逝去後の活動休止を経て2024年9月にエミリー・アームストロングを新リードボーカルに迎えた新体制、など。故人を「いま歌っている」と誤解されないようにする。
${basePromptTail}`;

    const baseResult = await model.generateContent(basePrompt);
    logGeminiUsage('comment_pack_base', baseResult.response);
    await persistGeminiUsageLog('comment_pack_base', baseResult.response.usageMetadata, { videoId });
    let baseText = baseResult.response.text()?.trim() ?? '';
    if (isNewRelease) {
      baseText = (baseText + COMMENT_PACK_NEW_RELEASE_DISCLAIMER).trim();
    }

    // 2. 自由コメント3本（新曲モードでは生成しない）
    const topics = [
      // 「断定しやすい要素（順位・受賞名・制作期間・録音工程の具体）」は避ける
      // 代わりに、歌詞テーマやサウンド特徴、ライブでの“よく語られる扱い”など
      // 会話の中で破綻しにくい観点に寄せる。
      '歌詞テーマや曲のメッセージ要点',
      'サウンドの特徴（メロディ/リズム/アレンジ/フックなど）と印象',
      'ライブでの扱い・カバー/言及・文化的影響（具体的な順位・受賞名は出さない）',
    ] as const;
    if (topics.length !== COMMENT_PACK_MAX_FREE_COMMENTS) {
      console.warn(
        '[comment-pack] topics length must match COMMENT_PACK_MAX_FREE_COMMENTS',
        topics.length,
      );
    }

    const containsUnreliableClaim = (txt: string): boolean => {
      if (!txt) return false;
      // エビデンス（出典メモや参照名）が明示されている場合は通す
      const hasEvidence = /出典|ソース|Wikipedia|公式|根拠/i.test(txt);
      if (hasEvidence) return false;
      const r = [
        /チャート.*(トップ|1位|首位)/,
        /ビルボード/i,
        /受賞|ノミネート|受賞歴/i,
        /グラミー/i,
        /主要.*(国|チャート).*トップ/,
        /わずか.*(日|日間)|数日で|異例.*速/i,
        /全ての工程|全工程|ミックスまで|録音では|レコーディングでは/i,
        /唯一無二|世界観を.*築き/i,
        /徹底したこだわり|こだわりが.*唯一/i,
        // 根拠なしバズ断定（ソーシャルで拡散/ブーム/象徴的など）
        /ブーム|バズ|巻き起こ|象徴的|影響力|拡散|瞬く間|世界中|世界中の/i,
        /チャレンジ|挑戦.*動画|BGM.*チャレンジ|TikTok|YouTube.*チャレンジ/i,
        /若者文化/i,
      ];
      return r.some((x) => x.test(txt));
    };

    const freeComments: string[] = [];

    if (!isNewRelease) {
      for (let i = 0; i < COMMENT_PACK_MAX_FREE_COMMENTS; i++) {
      const topic = topics[i];
      const used = [baseText, ...freeComments].filter(Boolean).join('\n---\n');
      const freePrompt = `以下の曲について、すでに基本コメントと他の自由コメントが存在します。

${metaLockBlock}

【すでに出ているコメント（重複禁止）】
${used || 'まだありません'}

あなたの役割:
・今回は「${topic}」の観点【だけ】から、この曲について新しい情報を1つ紹介してください。
・基本コメントや他の自由コメントと同じ事実・同じ趣旨（リリース年・アルバム名・歌詞の内容説明など）は繰り返さないこと。
・既に「リックロール」「有名ミーム」と書かれていれば、それを別の自由コメントでもう一度説明しない、という意味です。

・禁止事項（断定・根拠薄い内容の回避）:
  - チャート順位/主要チャートのトップ/ビルボード等の順位・スコアを断定しない
  - 受賞歴/ノミネート/グラミー等を断定しない
  - 「数日で」「異例の速さ」など制作期間の断定をしない
  - 「全ての工程を手掛けた」「ミックスまで」など録音工程の断定をしない
  - 「唯一無二」「世界観を築き上げた」など過剰な断定表現をしない
  - 知っていることでも、会話内に根拠がない場合は“断定”ではなく“印象/要点/雰囲気”として控えめに述べる
  - 特定のボーカル名／メンバー名を「この動画で歌っている」と断定しない（タイトルや説明文に明記がある場合のみ）
  - 亡くなった可能性があるメンバーに触れる場合は、現在の歌唱者と誤解される断定表現（「シャウトが炸裂」等）を避け、無理に名前を出さない

出力ルール:
・日本語、です・ます調。
・2〜4文、60〜140文字程度。
・前置きは短く。「豆知識ですが」は使わない。
・この1本だけを出力してください。説明や箇条書きは禁止。`;

      try {
        let attempt = 0;
        let prompt = freePrompt;
        while (attempt < 2) {
          attempt += 1;
          const res = await model.generateContent(prompt);
          logGeminiUsage(`comment_pack_free_${i + 1}`, res.response);
          await persistGeminiUsageLog(`comment_pack_free_${i + 1}`, res.response.usageMetadata, {
            videoId,
          });
          const txt = res.response.text()?.trim() ?? '';
          if (txt && !containsUnreliableClaim(txt)) {
            freeComments.push(txt);
            break;
          }
          // 禁止パターンっぽい場合は「断定禁止」だけ上乗せして再生成
          if (attempt === 2) break;
          prompt =
            prompt +
            '\n（追加指示）禁止事項に抵触しないよう、チャート/受賞/制作期間/録音工程の断定を完全に避け、歌詞テーマ/サウンド特徴/印象だけで短く書いてください。';
        }
      } catch (e) {
        console.error('[api/ai/comment-pack] generate free comment', i, e);
      }
      }
    }

    const freeCommentsCapped = freeComments.slice(0, COMMENT_PACK_MAX_FREE_COMMENTS);

    // song_tidbits に保存（新曲は基本のみ、通常は基本＋自由3本）
    if (supabase && songId) {
      const allBodies = isNewRelease
        ? [baseText]
        : [baseText, ...freeCommentsCapped].filter((t) => t.trim());
      const sources = ['ai_commentary', 'ai_chat_1', 'ai_chat_2', 'ai_chat_3'];
      for (let i = 0; i < allBodies.length; i++) {
        try {
          await insertTidbit(supabase, {
            songId,
            videoId,
            body: allBodies[i],
            source: sources[i] ?? 'ai_chat',
          });
        } catch (e) {
          console.error('[api/ai/comment-pack] insertTidbit', i, e);
        }
      }
    }

    return NextResponse.json({
      songId,
      videoId,
      baseComment: baseText,
      freeComments: freeCommentsCapped,
      ...(isNewRelease ? { newReleaseOnly: true } : {}),
    });
  } catch (e) {
    console.error('[api/ai/comment-pack]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

