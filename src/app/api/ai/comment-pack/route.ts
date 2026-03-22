import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import { isJpDomesticOfficialChannelAiException } from '@/lib/jp-official-channel-exception';
import { resolveJapaneseEconomyWithMusicBrainz } from '@/lib/resolve-japanese-economy';
import {
  colorsStudiosTrustsOembedArtistFirst,
  isAppleMusicChannelAuthor,
  isGeniusChannelAuthor,
  shouldSkipAiCommentaryForUncertainArtistResolution,
} from '@/lib/format-song-display';
import { resolveArtistSongForPackAsync } from '@/lib/youtube-artist-song-for-pack';
import { getVideoSnippet } from '@/lib/youtube-search';
import { getGeminiModel, logGeminiUsage } from '@/lib/gemini';
import { persistGeminiUsageLog } from '@/lib/gemini-usage-log';
import { createAdminClient } from '@/lib/supabase/admin';
import { upsertSongAndVideo } from '@/lib/song-entities';
import {
  COMMENT_PACK_MAX_FREE_COMMENTS,
  COMMENT_PACK_NEW_RELEASE_DISCLAIMER,
  COMMENT_PACK_SOURCES,
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
 * - 基本コメント1本 + 自由コメント最大3本（1:栄誉・チャート 2:歌詞 3:サウンド）をまとめて生成する
 * - 動画公開から30日以内は「新曲」とみなし、基本コメントのみ（末尾に注釈）。自由3本は生成しない
 * - 同一動画は song_tidbits から再利用（新曲は注釈付き基本のみキャッシュ、それ以外は4本そろいでキャッシュ）
 * - 邦楽節約: メタデータが日本語っぽい／音声言語が ja／MusicBrainz で Area=Japan 等のときは AI 曲解説を出さない（skipAiCommentary）。ただし ONE OK ROCK / XG / Ado / ATARASHII GAKKO!（＋88rising）/ YOASOBI の公式 YouTube チャンネル（channelId 固定＋ env 追加分）は除外。COMMENT_PACK_JP_ECONOMY=0 でオフ
 * - COMMENT_PACK_SKIP_CACHE=1 で常に新規生成
 * - メタからアーティストを信頼できない（曲名も空・キュレーターchでアップローダー名=アーティスト等）は skipAiCommentary。AI_COMMENTARY_ALLOW_UNCERTAIN_ARTIST=1 で無効化
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

    const title = oembed?.title ?? snippet?.title ?? videoId;
    const authorName = oembed?.author_name;
    const { artist, artistDisplay, song } = await resolveArtistSongForPackAsync(
      title,
      authorName,
      snippet,
    );

    const isNewRelease = isPublishedWithinLastDays(snippet?.publishedAt, NEW_RELEASE_DAYS);
    const isJpEconomy = await resolveJapaneseEconomyWithMusicBrainz({
      title,
      artistDisplay,
      artist,
      song,
      description: snippet?.description ?? null,
      channelTitle: snippet?.channelTitle ?? null,
      defaultAudioLanguage: snippet?.defaultAudioLanguage ?? null,
    });
    /** 新曲のみ基本1本（自由3本なし）。邦楽は公式チャンネル例外を除き生成しない */
    const baseOnlyPack = isNewRelease;

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

    if (isJpEconomy && !isJpDomesticOfficialChannelAiException(snippet?.channelId)) {
      return NextResponse.json({ skipAiCommentary: true, songId, videoId });
    }

    if (
      shouldSkipAiCommentaryForUncertainArtistResolution({
        artist,
        artistDisplay,
        song,
        authorName,
        title,
      })
    ) {
      return NextResponse.json({
        skipAiCommentary: true,
        songId,
        videoId,
        skipReason: 'uncertain_artist',
      });
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
            ...(nrCached.tidbitIds?.length ? { tidbitIds: nrCached.tidbitIds } : {}),
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
            ...(cached.tidbitIds?.length ? { tidbitIds: cached.tidbitIds } : {}),
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

    const colorsOfficialLock = colorsStudiosTrustsOembedArtistFirst(authorName, title)
      ? `・COLORS（A COLORS SHOW）公式配信: 「${artistLabel}」＝アーティスト、「${songLabel}」＝曲名で確定。逆の対応・別読み・言い逃れは禁止。\n`
      : '';

    const geniusOfficialLock = isGeniusChannelAuthor(authorName)
      ? `・Genius 公式チャンネル: タイトル先頭の「Genius」はメディア名です。「${artistLabel}」＝アーティスト、「${songLabel}」＝曲名のみを正とし、Genius をアーティストや「彼ら」の指す先にしないこと。\n`
      : '';

    const appleMusicOfficialLock = isAppleMusicChannelAuthor(authorName)
      ? `・Apple Music 公式チャンネル: タイトル先頭の「Apple Music」は配信プラットフォーム名です。「${artistLabel}」＝アーティスト、「${songLabel}」＝曲名のみを正とし、Apple Music をアーティストや「彼ら」の指す先にしないこと。\n`
      : '';

    const metaLockBlock = `【メタデータの前提（厳守）】
・YouTube 動画タイトル（原文）: ${rawYouTubeTitle}
・【アーティスト（歌手・バンド）】= 「${artistLabel}」のみ。これは人名またはバンド名です。
・【曲名】= 「${songLabel}」のみ。これは楽曲のタイトルです。
${colorsOfficialLock}${geniusOfficialLock}${appleMusicOfficialLock}
・絶対禁止: 「${songLabel}」をアーティスト名のように扱い、「${artistLabel}」を曲名のように扱うこと（例:「${songLabel}の代表曲『${artistLabel}』」は誤り。正しくは「${artistLabel}の『${songLabel}』」）。
・「〜の代表曲」は必ず アーティスト → 曲 の順で書く（${artistLabel} の代表曲として『${songLabel}』、など）。
・アーティスト名と曲名を入れ替えたり、別の架空の曲として語らないこと。
・タイトル・チャンネル名と矛盾するリリース年・アルバム名・編成・未来の年号は書かない。不明・不確実ならその一句を省くか「〜として知られる」など弱い表現にとどめる。
・本APIは Music8 等の外部楽曲DBを参照していません。根拠のない固有名・年号を作らないこと。
・YouTube タイトル原文に (HD Remaster)・[4K Remaster]・Remaster・公式動画向けの副題が付いていても、本文で曲名を示すときは【曲名】だけとすること。リマスター・画質・配信向けの表記を曲名に付けない（例：『Believe』と書き、『Believe [4K Remaster]』のようにしない）。`;

    // 1. 基本コメント（/commentary と似た役割だが、このAPI専用に少し短めに生成）
    const basePromptTail = isNewRelease
      ? `・この動画は公開から約1ヶ月以内の新曲扱いです。周辺情報が不十分な可能性があるため、断定を避け、分かる範囲の紹介にとどめてください（推測や詳細な背景説明は控えめに）。
・この後に自由コメントは出しません。ここ1本で完結する基本紹介にしてください。`
      : `・この1本は「基本情報」専用です。あとから3本の自由コメント（解釈・サウンド・栄誉など）が続くため、ここでは深い解説や歌詞の細かい読み下しは書かないでください。`;

    const basePrompt = `選曲アナウンスの直後に、最初にだけ表示する「曲の基本情報」を1本だけ書いてください。現在は${currentYear}年です。
${metaLockBlock}

【書き出しの型（必須）】
・本文の最初の文は、必ず「${artistLabel}の『${songLabel}』」で始めてください（全角かぎかっこ『』で曲名を囲む）。別の言い回しで始めないこと。
・続けてリリース年・アルバム・雰囲気を同じ段落内で述べてください。

【基本情報に含めるもの（この順で簡潔に）】
・リリース年（分かる範囲）
・収録アルバム名（分かれば）
・ジャンルや当時の位置づけを一言（例：ニューウェーブ全盛期の代表曲のひとつ、など）
・曲のテーマや雰囲気を1文（解釈は深掘りしない。概要だけ）

【基本情報に含めないもの】
・チャート順位、週数、売上、グラミー等の受賞・ノミネート（これらは後続の自由コメントで扱います）
・歌詞の詳細な読解や論争の紹介（自由コメント側）
・楽器パートの細かい分析（自由コメント側）

・80〜150文字程度、日本語、です・ます調。
・バンド名とリリース年から体制変更の特筆事項（故メンバーの逝去・活動休止・新ボーカル加入など）を知っている場合は、簡潔にひと言触れてよい。故人を「いま歌っている」と誤解されないようにする。
${basePromptTail}`;

    const baseResult = await model.generateContent(basePrompt);
    logGeminiUsage('comment_pack_base', baseResult.response);
    await persistGeminiUsageLog('comment_pack_base', baseResult.response.usageMetadata, { videoId });
    let baseText = baseResult.response.text()?.trim() ?? '';
    if (isNewRelease) {
      baseText = (baseText + COMMENT_PACK_NEW_RELEASE_DISCLAIMER).trim();
    }

    // 2. 自由コメント3本（基本情報のあと。1本目＝栄誉・チャート、2＝歌詞、3＝サウンド）
    const topics = [
      '商業的成功と栄誉（世界的な大ヒットに限り、代表チャート・グラミー等の広く知られた事実を簡潔にたたえる。全米シングルチャート（Billboard Hot 100）の1位・首位・上位入りなどを書くときは、必ずその実績が生じた西暦を「1990年」のように明示すること（どの年のチャートか分からない場合は順位の断定を書かない）。可能なら冒頭一句で上記の形で記録に触れてよい。マイナー曲や不明なら受賞に触れずライブ扱いや文化的言及にとどめる）',
      '歌詞テーマやメッセージ、よく語られる誤解や解釈のポイント',
      'サウンドの特徴（メロディ/リズム/アレンジ/フックなど）と印象',
    ] as const;
    if (topics.length !== COMMENT_PACK_MAX_FREE_COMMENTS) {
      console.warn(
        '[comment-pack] topics length must match COMMENT_PACK_MAX_FREE_COMMENTS',
        topics.length,
      );
    }

    /** チャート・グラミー等を意図的に含めてよい自由コメント（1本目＝栄誉）用は allowChartAwards=true */
    const containsUnreliableClaim = (txt: string, allowChartAwards: boolean): boolean => {
      if (!txt) return false;
      const hasEvidence = /出典|ソース|Wikipedia|公式|根拠/i.test(txt);
      if (hasEvidence) return false;
      const rAlways = [
        /わずか.*(日|日間)|数日で|異例.*速/i,
        /全ての工程|全工程|ミックスまで|録音では|レコーディングでは/i,
        /唯一無二|世界観を.*築き/i,
        /徹底したこだわり|こだわりが.*唯一/i,
        /ブーム|バズ|巻き起こ|象徴的|影響力|拡散|瞬く間|世界中|世界中の/i,
        /チャレンジ|挑戦.*動画|BGM.*チャレンジ|TikTok|YouTube.*チャレンジ/i,
        /若者文化/i,
      ];
      if (rAlways.some((x) => x.test(txt))) return true;
      if (allowChartAwards) return false;
      const rNoChart = [
        /チャート.*(トップ|1位|首位)/,
        /ビルボード/i,
        /受賞|ノミネート|受賞歴/i,
        /グラミー/i,
        /主要.*(国|チャート).*トップ/,
      ];
      return rNoChart.some((x) => x.test(txt));
    };

    const freeComments: string[] = [];

    if (!baseOnlyPack) {
      for (let i = 0; i < COMMENT_PACK_MAX_FREE_COMMENTS; i++) {
      const topic = topics[i];
      const isHonorsTopic = i === 0; // 1本目＝栄誉・チャート
      const used = [baseText, ...freeComments].filter(Boolean).join('\n---\n');

      const banBlockStandard = `・禁止事項（断定・根拠薄い内容の回避）:
  - チャート順位/ビルボード等の順位・スコア、受賞/グラミー等は書かない（1本目の自由コメントで既に扱います。ここでは触れない）
  - 「数日で」「異例の速さ」など制作期間の断定をしない
  - 「全ての工程を手掛けた」「ミックスまで」など録音工程の断定をしない
  - 「唯一無二」「世界観を築き上げた」など過剰な断定表現をしない
  - 特定のボーカル名／メンバー名を「この動画で歌っている」と断定しない（タイトルや説明文に明記がある場合のみ）
  - 亡くなった可能性があるメンバーに触れる場合は、現在の歌唱者と誤解される断定表現を避け、無理に名前を出さない`;

      const banBlockHonors = `・この1本だけの必須・禁止:
  - ビルボードHot 100・全米シングルチャート等の順位（1位・首位・トップ等）を書くときは、必ず西暦の年を添える（例：「1990年の全米シングルチャートで1位」）。年がはっきり分からないときは順位やチャート成績に触れない
  - 数字・順位・受賞名は「広く参照される事実」に限る。不確かな週数や売上、作った受賞歴は書かない
  - マイナー曲・インディーで明確な大ヒットでないと判断したら、チャート/グラミーに触れず「ライブ定番」「カバーが多い」などにとどめる
  - 制作期間の断定（「数日で」等）、録音工程の断定、TikTokバズや若者文化の誇張はしない`;

      const freePrompt = `以下の曲について、すでに「基本情報」と他の自由コメントが存在します。

${metaLockBlock}

【すでに出ているコメント（重複禁止）】
${used || 'まだありません'}

あなたの役割:
・今回は「${topic}」の観点【だけ】から、この曲について新しい情報を1つ紹介してください。
・基本情報で既に述べたリリース年・アルバム名・テーマの概要を繰り返さないこと。
・他の自由コメントと同じ趣旨の繰り返しも避けること。

${isHonorsTopic ? banBlockHonors : banBlockStandard}

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
          if (txt && !containsUnreliableClaim(txt, isHonorsTopic)) {
            freeComments.push(txt);
            break;
          }
          if (attempt === 2) break;
          prompt = isHonorsTopic
            ? prompt +
              '\n（追加指示）事実として確からしい代表チャート・グラミー等だけを短く。チャート順位を書く場合は西暦年（例：1990年）を必ず添える。年が不明なら順位に触れず書き直す。曖昧なら受賞に触れずに書き直してください。'
            : prompt +
              '\n（追加指示）チャート/受賞/制作期間/録音工程に触れず、指定観点だけで短く書き直してください。';
        }
      } catch (e) {
        console.error('[api/ai/comment-pack] generate free comment', i, e);
      }
      }
    }

    const freeCommentsCapped = freeComments.slice(0, COMMENT_PACK_MAX_FREE_COMMENTS);
    /** insert・tidbitId 紐づけ・クライアント表示を一致させる（空文字スロットを除外） */
    const freeBodiesForPack = freeCommentsCapped
      .map((t) => (typeof t === 'string' ? t.trim() : ''))
      .filter((t) => t.length > 0);

    // song_tidbits に保存（新曲は基本のみ、通常は基本＋自由3本）
    const tidbitIds: (string | null)[] = [];
    if (supabase && songId) {
      const dbWrite = createAdminClient() ?? supabase;
      const allBodies = baseOnlyPack
        ? [baseText.trim()].filter((t) => t.length > 0)
        : [baseText.trim(), ...freeBodiesForPack].filter((t) => t.length > 0);

      // 同一動画で再生成（COMMENT_PACK_SKIP_CACHE 等）するとき、古い ai_commentary / ai_chat_* と UNIQUE がぶつかり
      // ai_chat_1 だけ insert 失敗 → 2本目に tidbitId が付かない、となる。先に該当行を消してから入れ直す。
      try {
        const { error: delErr } = await dbWrite
          .from('song_tidbits')
          .delete()
          .eq('video_id', videoId)
          .in('source', [...COMMENT_PACK_SOURCES]);
        if (delErr) {
          console.warn('[api/ai/comment-pack] delete old song_tidbits', delErr.message);
        }
      } catch (e) {
        console.warn('[api/ai/comment-pack] delete old song_tidbits', e);
      }

      const sources = ['ai_commentary', 'ai_chat_1', 'ai_chat_2', 'ai_chat_3'];
      for (let i = 0; i < allBodies.length; i++) {
        try {
          const row = await insertTidbit(dbWrite, {
            songId,
            videoId,
            body: allBodies[i],
            source: sources[i] ?? 'ai_chat',
          });
          tidbitIds.push(row?.id ?? null);
        } catch (e) {
          console.error('[api/ai/comment-pack] insertTidbit', i, e);
          tidbitIds.push(null);
        }
      }
    }

    const freeCommentTidbitIds =
      !baseOnlyPack && tidbitIds.length > 1 ? tidbitIds.slice(1) : [];

    return NextResponse.json({
      songId,
      videoId,
      baseComment: baseText,
      freeComments: freeBodiesForPack,
      ...(isNewRelease ? { newReleaseOnly: true } : {}),
      ...(tidbitIds.length > 0 ? { tidbitIds } : {}),
      ...(freeCommentTidbitIds.length > 0 ? { freeCommentTidbitIds } : {}),
    });
  } catch (e) {
    console.error('[api/ai/comment-pack]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

