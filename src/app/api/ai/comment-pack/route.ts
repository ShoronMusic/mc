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
import { containsUnreliableCommentPackClaim } from '@/lib/ai-output-policy';
import { getGeminiModel, logGeminiUsage } from '@/lib/gemini';
import { persistGeminiUsageLog } from '@/lib/gemini-usage-log';
import { createAdminClient } from '@/lib/supabase/admin';
import { upsertSongAndVideo } from '@/lib/song-entities';
import { isDevMinimalSongAi } from '@/lib/dev-minimal-song-ai';
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
 * - NEXT_PUBLIC_DEV_MINIMAL_SONG_AI=1 で開発簡略: 基本1本のみ生成・キャッシュ返却も自由3本を落とす（新曲30日以内扱いと同様）
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
    const devMinimalSongAi = isDevMinimalSongAi();
    const isJpEconomy = await resolveJapaneseEconomyWithMusicBrainz({
      title,
      artistDisplay,
      artist,
      song,
      description: snippet?.description ?? null,
      channelTitle: snippet?.channelTitle ?? null,
      defaultAudioLanguage: snippet?.defaultAudioLanguage ?? null,
    });
    /** 新曲のみ基本1本（自由3本なし）。開発フラグ時も同様。邦楽は公式チャンネル例外を除き生成しない */
    const baseOnlyPack = isNewRelease || devMinimalSongAi;

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
          const stripFreeForDev = devMinimalSongAi && !isNewRelease;
          const tidbitIdsFull = cached.tidbitIds ?? [];
          const tidbitIdsForClient = stripFreeForDev ? tidbitIdsFull.slice(0, 1) : [...tidbitIdsFull];
          const freeCommentsForClient = stripFreeForDev ? [] : [...cached.freeComments];
          const freeCommentTidbitIds =
            !stripFreeForDev && tidbitIdsForClient.length > 1
              ? tidbitIdsForClient.slice(1)
              : [];
          return NextResponse.json({
            songId,
            videoId,
            baseComment: cached.baseComment,
            freeComments: freeCommentsForClient,
            source: 'library',
            ...(tidbitIdsForClient.length ? { tidbitIds: tidbitIdsForClient } : {}),
            ...(freeCommentTidbitIds.length > 0 ? { freeCommentTidbitIds } : {}),
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
・重要：曲名に含まれる英単語「With」は**共演者をつなぐ語ではなくタイトルの一部**です（例: 『Die With A Smile』全体が曲名）。【曲名】を短くした別名にしたり、「With」以降を別人名として新たな共演者にしたりしないこと。架空のアルバム名・プロジェクト名を作らないこと。
${colorsOfficialLock}${geniusOfficialLock}${appleMusicOfficialLock}
・YouTube タイトルに「 • 」「 · 」のあとに続く語（TopPop、番組名など）が付いていても、それは**曲名の一部ではない**。【曲名】は「${songLabel}」のみとし、番組名を曲名や『』の中に含めないこと。
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
      : devMinimalSongAi
        ? `・開発中モードのため、自由コメントは生成しません。ここ1本で完結する基本紹介にしてください。`
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
・チャート順位、週数、売上、グラミー等の受賞・ノミネートの**具体**（これらは後続の自由コメント1本目で扱います）
・歌詞の詳細な読解や論争の紹介（自由コメント側）
・楽器パートの細かい分析（自由コメント側）

【基本情報に足してよい一言（任意）】
・広く知られた大ヒット曲に限り、テーマの要約のあとに**一文だけ**「2010年代前半に世界的なヒットとなった」など、**時期＋規模の枠**を添えてよい（チャート名・順位・週数は書かない。具体は1本目の自由コメントに任せる）。

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
      '商業的成功と社会的な話題性（このスロット専用。**必ず**次のいずれかを含めること：①主要チャートでの**定性的**な成功（西暦の年を明記。**1位・9位・33位など順位の数字は書かない**。例：1983年頃に全英シングルチャートで大きなヒット、翌年には米ビルボードでもチャート入り）②グラミー等の主要ノミネート・受賞（分かる場合のみ）③複数国で広く再生・話題となったことなど、年とともに触れられる事実。**禁止**：○位・最高○位・第○位・「〜週1位」など順位や週数の具体数字、作詞者の私人話、伝聞だけの表現、歌詞の読み下し。マイナー曲はライブ定番やカバーの多さにとどめる）',
      '歌詞テーマやメッセージ（1〜2文で要点のみ。デュエットなら「双方の視点の対比」など**ひとつの要約**にまとめる。パートごとの長い列挙は禁止）',
      'サウンドの特徴（メロディ・リズム・アレンジの**うち1点**に絞って具体化する。「耳に残るフック」など抽象語の積み重ねだけは禁止）',
    ] as const;
    if (topics.length !== COMMENT_PACK_MAX_FREE_COMMENTS) {
      console.warn(
        '[comment-pack] topics length must match COMMENT_PACK_MAX_FREE_COMMENTS',
        topics.length,
      );
    }

    const freeComments: string[] = [];

    if (!baseOnlyPack) {
      for (let i = 0; i < COMMENT_PACK_MAX_FREE_COMMENTS; i++) {
      const topic = topics[i];
      const isHonorsTopic = i === 0; // 1本目＝栄誉・チャート
      const used = [baseText, ...freeComments].filter(Boolean).join('\n---\n');

      const banBlockStandard = `・禁止事項（断定・根拠薄い内容の回避）:
  - チャート順位/ビルボード等の順位・スコア、受賞/グラミー等は書かない（1本目の自由コメントで既に扱います。ここでは触れない）
  - 「インスピレーションを得て書かれたと言われています」など、裏付けのない私人話・伝聞調は禁止
  - 「数日で」「異例の速さ」など制作期間の断定をしない
  - 「全ての工程を手掛けた」「ミックスまで」など録音工程の断定をしない
  - 「唯一無二」「世界観を築き上げた」など過剰な断定表現をしない
  - 特定のボーカル名／メンバー名を「この動画で歌っている」と断定しない（タイトルや説明文に明記がある場合のみ）
  - 亡くなった可能性があるメンバーに触れる場合は、現在の歌唱者と誤解される断定表現を避け、無理に名前を出さない`;

      const banBlockHonors = `・この1本だけの必須・禁止:
  - **必須**：チャート的な成功・主要賞・または複数国でのヒットなど、西暦付きで触れられる事実を**少なくとも1つ**書く（私人のインスピレーション談や歌詞の細読だけで終えない）
  - **重要：このAPIはチャート順位のデータベースを参照していません。1位・2位・9位・33位・「最高○位」「第○位」「〜週連続1位」など、順位や週数の具体数字は一切書かないこと**（モデルが毎回違う数字を出してしまい利用者を混乱させるため）。チャートに触れるなら「全英シングルで大ヒット」「1984年頃に米ビルボードでもチャート入り」「トップ10圏での健闘」など**定性的な表現**に限る
  - 全英と全米は別市場であることは踏まえ、**両方に触れる場合も順位の数字は使わず**、年＋国またはチャート種＋定性（大ヒット・ヒット曲・長くチャートに滞留など）で書く
  - グラミー等の受賞・ノミネートは**正式名称が分かる場合のみ**（不確かなら書かない）
  - マイナー曲・インディーで明確な大ヒットでないと判断したら、チャート/グラミーに触れず「ライブ定番」「カバーが多い」などにとどめる
  - 制作期間の断定（「数日で」等）、録音工程の断定、TikTokバズや若者文化の誇張はしない
  - 「恋人からインスピレーションを得た」等の私人話・作詞秘話に逃げない（その内容は2本目以降でも推測口調は禁止）`;

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

      const maxAttempts = 3;
      try {
        let attempt = 0;
        let prompt = freePrompt;
        while (attempt < maxAttempts) {
          attempt += 1;
          const res = await model.generateContent(prompt);
          logGeminiUsage(`comment_pack_free_${i + 1}`, res.response);
          await persistGeminiUsageLog(`comment_pack_free_${i + 1}`, res.response.usageMetadata, {
            videoId,
          });
          const txt = res.response.text()?.trim() ?? '';
          /** 3回目は栄誉枠でもチャート数字を避けるフォールバック → 歌詞・サウンド枠と同じ厳しさで通す */
          const policyHonors = isHonorsTopic && attempt < maxAttempts;
          if (txt && !containsUnreliableCommentPackClaim(txt, policyHonors)) {
            freeComments.push(txt);
            break;
          }
          if (attempt >= maxAttempts) {
            if (!txt || containsUnreliableCommentPackClaim(txt, policyHonors)) {
              console.warn(
                '[comment-pack] free comment slot',
                i + 1,
                'failed after',
                maxAttempts,
                'attempts. videoId=',
                videoId,
              );
            }
            break;
          }
          if (attempt === 1) {
            prompt = isHonorsTopic
              ? prompt +
                '\n（追加指示）チャートは**順位の数字を出さず**（9位・33位・1位など禁止）、西暦＋国またはチャート種＋大ヒット・チャート入りなど定性的に。グラミーは正式名が確かなときだけ。英国と米国の両方に触れる場合も数字順位は使わない。'
              : prompt +
                '\n（追加指示）チャート/受賞/制作期間/録音工程に触れず、指定観点だけで短く書き直してください。';
          } else if (attempt === 2) {
            prompt = isHonorsTopic
              ? prompt +
                '\n（3回目・最終）ビルボード・グラミー・順位・週数・「〜週連続」は書かないこと。リリース年以降に**広く聴かれ、当時のポップ・シーンで話題となった**など、穏やかな位置づけを1〜2文・60〜100字で。誇張・バズ表現は禁止。'
              : prompt +
                '\n（3回目・最終）指定観点だけ、60〜100字。チャート/受賞/制作断定は避け、穏や当な表現に。';
          }
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

