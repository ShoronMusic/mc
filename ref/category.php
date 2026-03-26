<?php get_header(); ?>
<main id="page-content">
	<span id="rec-top-anchor"></span>
	<div class="rec-archive">

<p class="subt">Artist::</p>
<h1><?php
$category = get_queried_object();
echo $category && function_exists('display_artist_name_with_the_prefix')
	? esc_html(display_artist_name_with_the_prefix($category->term_id))
	: esc_html(single_cat_title('', false));
?></h1>
<hr>

<p style="display: flex; gap: 10px; align-items: center;">
						<?php
						$category = get_queried_object();
						if ($category && !empty($category->term_id)) {
								$admin_edit_url = admin_url('edit-tags.php?action=edit&taxonomy=category&tag_ID=' . (int) $category->term_id);
								$artist_display_name = ($category && function_exists('display_artist_name_with_the_prefix'))
										? display_artist_name_with_the_prefix($category->term_id)
										: (isset($category->name) ? $category->name : single_cat_title('', false));
								echo '<a href="' . esc_url($admin_edit_url) . '" target="_blank" class="category-edit-button" style="padding: 8px 12px; background-color: #0073aa; color: #fff; text-decoration: none; border-radius: 5px; font-size: 14px;" data-artist-name="' . esc_attr($artist_display_name) . '" onclick="var el=this; var n=el.getAttribute(\'data-artist-name\'); var u=el.href; if(navigator.clipboard&&navigator.clipboard.writeText&&n){ navigator.clipboard.writeText(n).then(function(){ window.open(u,\'_blank\'); }).catch(function(){ window.open(u,\'_blank\'); }); } else { window.open(u,\'_blank\'); } return false;">カテゴリーを編集</a>';
						}
						?>

						<!-- 更新ボタン -->
						<button onclick="location.reload();" style="padding: 8px 12px; background-color: #28a745; color: #fff; border: none; border-radius: 5px; font-size: 14px; cursor: pointer;">更新</button>
						<a href="javascript:history.back();" style="display: inline-block; padding: 8px 12px; background-color: #6c757d; color: #fff; text-decoration: none; border-radius: 5px; font-size: 14px;">戻る</a>
				</p>

<hr>
<?php
$category = get_queried_object();
$term_id = $category->term_id;
$term_context = 'category_' . $term_id;

// ACF 取得（写真＋説明文右側用・写真下の日本語読み・Occupation用）
$artistimage1 = null;
$spotify_artist_images = null;
$occupation_for_photo = null;
$artistjpname_for_photo = null;
if (function_exists('get_field')) {
	$artistimage1 = get_field('artistimage1', $term_context);
	$spotify_artist_images = get_field('spotify_artist_images', $term_context);
	$jp = get_field('artistjpname', $category);
	if (empty($jp)) $jp = get_field('artistjpname', $term_context);
	if (!empty($jp)) $artistjpname_for_photo = is_string($jp) ? $jp : (string) $jp;
	// Occupation: タクソノミーは term オブジェクトまたは 'category_'.$term_id で取得、フィールド名は小文字/大文字両方試す
	$occ = get_field('occupation', $category);
	if (empty($occ)) {
		$occ = get_field('occupation', $term_context);
	}
	if (empty($occ)) {
		$occ = get_field('Occupation', $category);
	}
	if (empty($occ)) {
		$occ = get_field('Occupation', $term_context);
	}
	if (!empty($occ)) {
		if (is_array($occ)) {
			$parts = [];
			foreach ($occ as $item) {
				if (is_array($item)) {
					$parts[] = isset($item['label']) ? $item['label'] : (isset($item['value']) ? $item['value'] : implode(', ', $item));
				} elseif (is_object($item)) {
					$parts[] = isset($item->label) ? $item->label : (isset($item->value) ? $item->value : (string) $item);
				} else {
					$parts[] = (string) $item;
				}
			}
			$occupation_for_photo = implode(', ', $parts);
		} else {
			$occupation_for_photo = (string) $occ;
		}
	}
}
$has_photo = ($artistimage1 && is_array($artistimage1) && !empty($artistimage1['url'])) || $spotify_artist_images;
?>
<div class="artistinfo-wrapper">
	<?php if ($has_photo) : ?>
	<div class="artistinfo-left">
		<?php
		$artist_name_alt = (function_exists('display_artist_name_with_the_prefix') && $term_id) ? display_artist_name_with_the_prefix($term_id) : single_cat_title('', false);
		if ($artistimage1 && is_array($artistimage1) && !empty($artistimage1['url'])) {
			echo '<img src="' . esc_url($artistimage1['url']) . '" alt="' . esc_attr($artist_name_alt) . '" class="artistinfo-image">';
		} else {
			echo '<img src="' . esc_url($spotify_artist_images) . '" alt="' . esc_attr($artist_name_alt) . '" class="artistinfo-image">';
		}
		if ($artistjpname_for_photo) {
			echo '<p class="artistinfo-jpname-below-photo">' . esc_html($artistjpname_for_photo) . '</p>';
		}
		if ($occupation_for_photo) {
			echo '<p class="artistinfo-occupation-below-photo">' . esc_html($occupation_for_photo) . '</p>';
		}
		?>
	</div>
	<?php endif; ?>
	<div class="artistinfo-right">
	<?php if (category_description()) : ?>
		<?php
		$cat_desc = category_description();
		// 貼り付け等で混入した壊れたHTML断片（" /> や "/>）を除去してタグ残骸の表示を防ぐ
		$cat_desc = preg_replace('/\s*"\s*\/>\s*/u', ' ', $cat_desc);
		$cat_desc = preg_replace('/\s*"\/>\s*/u', ' ', $cat_desc);
		?>
		<p class="artistinfo-description"><?php echo $cat_desc; ?></p>
	<?php endif; ?>
		<?php if ($occupation_for_photo && !$has_photo) : ?>
		<p class="artistinfo-row artistinfo-occupation-fallback"><?php echo esc_html($occupation_for_photo); ?></p>
		<?php endif; ?>

<?php
// artistinfo ACF フィールドグループを表示（カテゴリー＝アーティスト）
if (function_exists('get_field')) :
	$artistorigin = get_field('artistorigin', $term_context);
	$artistactiveyearstart = get_field('artistactiveyearstart', $term_context);
	$artistborn = get_field('artistborn', $term_context);
	$artistjpname = get_field('artistjpname', $term_context);
	$member = get_field('member', $term_context);
	$artistdied = get_field('artistdied', $term_context);
	$occupation = get_field('occupation', $term_context);
	$related_artists = get_field('related_artists', $term_context);
	$youtube_channel = get_field('youtube_channel', $term_context);
	$wikipedia_page = get_field('wikipedia_page', $term_context);
	$spotify_artist_id = get_field('spotify_artist_id', $term_context);

	$has_any = $artistorigin || $artistactiveyearstart || $artistborn || $artistjpname
		|| $member || $artistdied || $occupation || $related_artists
		|| $youtube_channel || $wikipedia_page || $spotify_artist_id;

	if ($has_any) :
		echo '<div class="artistinfo-acf">';
		if ($artistorigin) echo '<p class="artistinfo-row"><strong>Origin:</strong> ' . esc_html($artistorigin) . '</p>';
		if ($artistactiveyearstart) echo '<p class="artistinfo-row"><strong>活動期間:</strong> ' . esc_html($artistactiveyearstart) . '</p>';
		if ($artistborn) {
			$born_digits = preg_replace('/\D/', '', $artistborn);
			$has_died = !empty($artistdied);
			if (strlen($born_digits) >= 8) {
				$y = substr($born_digits, 0, 4);
				$m = substr($born_digits, 4, 2);
				$d = substr($born_digits, 6, 2);
				$display_date = $y . '.' . $m . '.' . $d;
				$birth = new DateTime($y . '-' . $m . '-' . $d);
				if ($has_died) {
					echo '<p class="artistinfo-row"><strong>生年月日:</strong> ' . esc_html($display_date) . '</p>';
				} else {
					$today = new DateTime('today');
					$age = $birth->diff($today)->y;
					echo '<p class="artistinfo-row"><strong>生年月日:</strong> ' . esc_html($display_date) . ' (' . (int) $age . ')</p>';
				}
			} else {
				echo '<p class="artistinfo-row"><strong>生年月日:</strong> ' . esc_html($artistborn) . '</p>';
			}
		}
		// 日本語読みは写真とOccupationの間に左カラムで表示するためここでは出さない
		if ($artistdied) {
			$died_digits = preg_replace('/\D/', '', $artistdied);
			$died_display = $artistdied;
			$age_at_death = null;
			if (strlen($died_digits) >= 8) {
				$dy = substr($died_digits, 0, 4);
				$dm = substr($died_digits, 4, 2);
				$dd = substr($died_digits, 6, 2);
				$died_display = $dy . '.' . $dm . '.' . $dd;
				$death = new DateTime($dy . '-' . $dm . '-' . $dd);
				if (!empty($artistborn) && strlen(preg_replace('/\D/', '', $artistborn)) >= 8) {
					$born_digits = preg_replace('/\D/', '', $artistborn);
					$by = substr($born_digits, 0, 4);
					$bm = substr($born_digits, 4, 2);
					$bd = substr($born_digits, 6, 2);
					$birth = new DateTime($by . '-' . $bm . '-' . $bd);
					$age_at_death = $birth->diff($death)->y;
				}
			}
			echo '<p class="artistinfo-row"><strong>永眠:</strong> ' . esc_html($died_display);
			if ($age_at_death !== null) {
				echo ' (' . (int) $age_at_death . ')';
			}
			echo '</p>';
		}
		// Member（タクソノミー）
		if ($member) {
			$member_names = [];
			$member_list = is_array($member) ? $member : array($member);
			foreach ($member_list as $m) {
				if (is_object($m) && isset($m->name)) $member_names[] = $m->name;
				elseif (is_numeric($m)) { $t = get_term($m); if ($t && !is_wp_error($t)) $member_names[] = $t->name; }
				elseif (is_string($m)) $member_names[] = $m;
			}
			if (!empty($member_names)) echo '<p class="artistinfo-row"><strong>Member:</strong> ' . esc_html(implode(', ', $member_names)) . '</p>';
		}
		// Occupation は写真の下にのみ表示（右側では出さない）
		// 関連アーティスト: "Name (slug) [num] | ..." 形式をパースして名前をカテゴリリンクに
		if ($related_artists) {
			$parts = array_map('trim', explode('|', $related_artists));
			$links = [];
			foreach ($parts as $part) {
				if (preg_match('/^(.+?)\s*\(([^)]+)\)\s*(?:\[\d+\])?$/u', $part, $m)) {
					$name = trim($m[1]);
					$slug = trim($m[2]);
					$term = get_term_by('slug', $slug, 'category');
					if ($term && !is_wp_error($term)) {
						$url = get_term_link($term);
						$links[] = '<a href="' . esc_url($url) . '">' . esc_html($name) . '</a>';
					} else {
						$links[] = esc_html($name);
					}
				} else {
					$links[] = esc_html($part);
				}
			}
			echo '<p class="artistinfo-row"><strong>関連アーティスト:</strong> ' . implode(' | ', $links) . '</p>';
		}
		// 外部リンク（アイコン表示）※ the_prefix を反映
		$artist_name_display = (function_exists('display_artist_name_with_the_prefix') && $term_id) ? display_artist_name_with_the_prefix($term_id) : single_cat_title('', false);
		if ($wikipedia_page || $spotify_artist_id || $youtube_channel) {
			echo '<div class="artistinfo-row artistinfo-external-links">';
			if ($wikipedia_page) {
				$wiki_url = (strpos($wikipedia_page, 'http') === 0) ? $wikipedia_page : 'https://en.wikipedia.org/wiki/' . $wikipedia_page;
				echo '<a href="' . esc_url($wiki_url) . '" target="_blank" rel="noopener" class="artistinfo-ext-link"><img src="https://www.music8.jp/images/logo_wikipedia.svg" alt="Wikipedia" class="artistinfo-ext-icon"> ' . esc_html($artist_name_display) . ' Wikipedia</a>';
			}
			if ($spotify_artist_id) {
				$spotify_url = 'https://open.spotify.com/intl-ja/artist/' . trim($spotify_artist_id);
				echo '<a href="' . esc_url($spotify_url) . '" target="_blank" rel="noopener" class="artistinfo-ext-link"><img src="https://www.music8.jp/images/Spotify_Icon_RGB_Green.png" alt="Spotify" class="artistinfo-ext-icon"> ' . esc_html($artist_name_display) . ' Spotify</a>';
			}
			if ($youtube_channel) {
				$yt_url = (strpos($youtube_channel, 'http') === 0) ? $youtube_channel : 'https://www.youtube.com/channel/' . $youtube_channel;
				echo '<a href="' . esc_url($yt_url) . '" target="_blank" rel="noopener" class="artistinfo-ext-link"><img src="https://www.music8.jp/images/youtube.svg" alt="YouTube" class="artistinfo-ext-icon"> ' . esc_html($artist_name_display) . ' YouTube Channel</a>';
			}
			echo '</div>';
		}
		echo '</div>';
	endif;
endif;
?>
	</div>
</div>

<p class="artistinfo-songs-above-genre"><?php echo (int) $category->count; ?> songs</p>
<hr>


<?php
// 現在のカテゴリーを取得
$category = get_queried_object();

// このカテゴリーに属するすべての投稿をクエリ
$posts_in_category = get_posts(array(
		'category' => $category->term_id,
		'posts_per_page' => -1
));

// これらの投稿に関連するすべてのジャンルを取得
$genres = [];
foreach($posts_in_category as $post) {
		$post_genres = get_the_terms($post->ID, 'genre');
		if ($post_genres && !is_wp_error($post_genres)) {
				foreach ($post_genres as $term) {
						if (!isset($genres[$term->term_id])) {
								$genres[$term->term_id] = ['name' => $term->name, 'count' => 1];
						} else {
								$genres[$term->term_id]['count']++;
						}
				}
		}
}

// ジャンルを投稿数でソート
uasort($genres, function($a, $b) {
		return $b['count'] - $a['count'];
});

// ジャンルと投稿数を表示
if (!empty($genres)) {
		echo '<ul class="genre-list">';
		foreach ($genres as $term_id => $genre) {
				echo '<li><a href="' . get_term_link(intval($term_id), 'genre') . '">' . $genre['name'] . ' (' . $genre['count'] . ')</a></li>';
		}
		echo '</ul>';
} else {
		echo 'このアーチストの曲にはジャンルがありません。';
}

?>



<hr>
<?php
// カテゴリーアーカイブページのクエリを変更して表示数を無制限に設定
query_posts(array(
	'posts_per_page' => -1,
	'cat' => get_query_var('cat')
));






// スタイル名 → カラー（サムネイル左バー用）。R&B は "rb" / "R&B" どちらでも同じ色に
$style_colors = array(
	'Rock' => '#6246ea',
	'Pop' => '#f25042',
	'Dance' => '#f39800',
	'Alternative' => '#448aca',
	'Electronica' => '#ffd803',
	'R&B' => '#8c7851',
	'Hip-Hop' => '#078080',
	'Metal' => '#9646ea',
	'Others' => '#BDBDBD',
);
$style_colors_normalized = array(
	'rock' => '#6246ea',
	'pop' => '#f25042',
	'dance' => '#f39800',
	'alternative' => '#448aca',
	'electronica' => '#ffd803',
	'r&b' => '#8c7851',
	'rb' => '#8c7851',  // "rb" でも R&B の色
	'hip-hop' => '#078080',
	'hiphop' => '#078080',
	'metal' => '#9646ea',
);

if (have_posts()) :
	while (have_posts()) : the_post();
		$videoId = get_post_meta(get_the_ID(), 'ytvideoid', true); // ytvideoidはカスタムフィールドのキー
		$style_terms = get_the_terms(get_the_ID(), 'style');
		$style_bar_color = $style_colors['Others'];
		if ($style_terms && !is_wp_error($style_terms) && !empty($style_terms)) {
			$first = $style_terms[0];
			$name_key = strtolower(trim($first->name));
			$slug_key = strtolower(trim($first->slug));
			$name_key_no_amp = str_replace('&', '', $name_key);
			if (isset($style_colors_normalized[$name_key])) {
				$style_bar_color = $style_colors_normalized[$name_key];
			} elseif (isset($style_colors_normalized[$slug_key])) {
				$style_bar_color = $style_colors_normalized[$slug_key];
			} elseif ($name_key_no_amp === 'rb' && isset($style_colors_normalized['rb'])) {
				$style_bar_color = $style_colors_normalized['rb'];
			} else {
				foreach ($style_colors as $name => $hex) {
					if (strcasecmp($name, $first->name) === 0) {
						$style_bar_color = $hex;
						break;
					}
				}
			}
		}
		?>

<?php
$thumbnail_url = get_the_post_thumbnail_url(get_the_ID(), 'thumbnail');
?>


<div class="post-item" data-videoid="<?php echo esc_attr($videoId); ?>">
		<div class="post-style-bar" style="background-color:<?php echo esc_attr($style_bar_color); ?>;"></div>
		<div class="post-thumbnail">
				<a href="javascript:void(0);" onclick="playVideo('<?php echo esc_js($videoId); ?>')">
						<div class="thumbnail-container" style="background-image: url('<?php the_post_thumbnail_url(); ?>');">
								<i class="fa-regular fa-circle-play play-icon"></i>
						</div>
				</a>
		</div>




<div class="post-content">
	<h3>
		<?php
			$categories = get_the_category();
			$artist_links = [];
			$artist_names = [];
			foreach ($categories as $cat) {
				$name_display = (function_exists('display_artist_name_with_the_prefix') && !empty($cat->term_id)) ? display_artist_name_with_the_prefix($cat->term_id) : $cat->name;
				$artist_links[] = '<a href="' . get_category_link($cat->term_id) . '">' . esc_html($name_display) . '</a>';
				$artist_names[] = $name_display;
			}
			echo implode(', ', $artist_links); // アーチスト名をカンマ区切りで表示（The 付き対応）
		?> - <a href="<?php the_permalink(); ?>"><?php the_title(); ?></a>
		<?php
			$post_content_raw = get_post_field('post_content', get_the_ID());
			$has_japanese = $post_content_raw && preg_match('/[\x{3000}-\x{303F}\x{3040}-\x{309F}\x{30A0}-\x{30FF}\x{4E00}-\x{9FFF}\x{FF00}-\x{FFEF}]/u', $post_content_raw);
			if ($has_japanese) {
				$content_for_modal = wp_strip_all_tags(do_shortcode($post_content_raw));
				$content_for_modal = trim(preg_replace('/[ \t]+/u', ' ', $content_for_modal));
				$modal_id = 'jp-desc-' . get_the_ID();
				$icon_url = get_template_directory_uri() . '/images/comment-svgrepo-com.svg';
				echo ' <button type="button" class="jp-desc-icon-btn" aria-label="日本語説明" data-modal-target="' . esc_attr($modal_id) . '"><img src="' . esc_url($icon_url) . '" alt="" class="jp-desc-icon"></button>';
				echo '<div id="' . esc_attr($modal_id) . '" class="jp-desc-content-src" style="display:none;">' . esc_html($content_for_modal) . '</div>';
			}
		?>
	</h3>

	<p>
		<?php
			$artistorigin = '';
			$origin_list = [];
			foreach ($categories as $category) {
				$origin = get_field('artistorigin', 'category_' . $category->term_id);
				if ($origin) $origin_list[] = $origin;
			}
			$artistorigin = implode(', ', $origin_list);
			echo esc_html($artistorigin);
		?> / <?php the_time('Y.m'); ?> 
		( <?php
			$genres = get_the_terms(get_the_ID(), 'genre');
			$genre_names = [];
			if ($genres) {
				$genre_links = [];
				foreach ($genres as $genre) {
					$genre_links[] = '<a href="' . get_term_link($genre->term_id) . '">' . $genre->name . '</a>';
					$genre_names[] = $genre->name;
				}
				echo implode(' / ', $genre_links);
			}
		?> )

		<?php
			$vocals = get_the_terms(get_the_ID(), 'vocal');
			$vocal_names = [];
			if ($vocals) {
				foreach ($vocals as $vocal) {
					$vocal_class = strtolower($vocal->name) == 'f' ? 'female-vocal' : 'male-vocal';
					echo '<i class="fas fa-microphone ' . $vocal_class . '"></i>';
					$vocal_names[] = $vocal->name;
				}
			}
		?>

		<?php
			$like_count = get_post_meta(get_the_ID(), 'likecount', true);
			if ($like_count && $like_count >= 1) {
				echo '<i class="fas fa-heart"></i>';
			}
		?>

		<?php
			// この曲が登録されているプレイリストを取得
			$song_playlists = function_exists('get_playlists_containing_song') ? get_playlists_containing_song(get_the_ID()) : array();

			// COPYボタン用テキスト
			$copyText = implode(', ', $artist_names)
				. ' - ' . get_the_title()
				. ' / ' . $artistorigin
				. ' ' . get_the_time('Y.m')
				. ' (' . implode(' / ', $genre_names) . ')'
				. ' ' . implode(', ', $vocal_names)
				. "\n";
		?>

		<button class="copy-button" data-copytext="<?php echo esc_attr($copyText); ?>">COPY</button>
		<button type="button" class="playlist-button" data-song-id="<?php echo esc_attr(get_the_ID()); ?>">PLAYLIST</button>
		<?php if (!empty($song_playlists)) : ?>
		<span class="song-playlist-names">[
			<?php
			$links = array();
			foreach ($song_playlists as $pl) {
				$links[] = '<a href="' . esc_url($pl['url']) . '">' . esc_html($pl['title']) . '</a>';
			}
			echo implode(', ', $links);
			?>
		]</span>
		<?php endif; ?>

	</p>
</div>







		</div>
	<?php endwhile;
else :
	echo '<p>投稿が見つかりませんでした。</p>';
endif;

// クエリを元に戻す（必要であれば）
wp_reset_query();
?>



<hr>


<hr>


<?php
// カテゴリーアーカイブページのクエリを作成
$args = array(
	'post_type' => 'post', // 投稿タイプ
	'posts_per_page' => -1, // 全投稿を取得
	'category_name' => get_queried_object()->slug // 現在のカテゴリースラッグを取得
);

$query = new WP_Query($args);
$video_ids = []; // 動画IDを保持する配列

// クエリに投稿があれば
if ($query->have_posts()) {
	while ($query->have_posts()) {
		$query->the_post();
		$video_id = get_post_meta(get_the_ID(), 'ytvideoid', true); // カスタムフィールドから動画IDを取得
		if ($video_id) {
			$video_ids[] = $video_id;
		}
	}
	// 投稿データをリセット
	wp_reset_postdata();
	?>
	<script>
		var videoIds = <?php echo json_encode($video_ids); ?>;
	</script>
	<?php
}
?>


<?php
// カテゴリーアーカイブの最初の投稿を取得
$first_post_args = array(
	'category_name' => get_query_var('category_name'),
	'posts_per_page' => 1
);
$first_post_query = new WP_Query($first_post_args);

if ($first_post_query->have_posts()) {
	$first_post_query->the_post();
	$video_id = get_post_meta(get_the_ID(), 'ytvideoid', true);
}
wp_reset_postdata(); // クエリをリセット
?>



<script>
	var songs = [];
	<?php
	$songs = []; // songs変数を初期化
	$category = get_queried_object();
	$args = array(
		'category_name' => $category->slug,
		'posts_per_page' => -1
	);
	$query = new WP_Query($args);
	while ($query->have_posts()) {
		$query->the_post();
		$videoId = get_post_meta(get_the_ID(), 'ytvideoid', true);
		$artist_categories = get_the_category(); // アーチスト名がカテゴリーとして保存されている
		$artist = !empty($artist_categories) ? $artist_categories[0]->name : ""; // 最初のカテゴリーをアーチスト名として使用
		$title = get_the_title(); // 曲名は投稿タイトルとして保存されている
		$icon = get_the_post_thumbnail_url();
		$songs[] = [
			'videoId' => $videoId,
			'artist' => $artist,
			'title' => $title,
			'icon' => $icon
		];
	}
	wp_reset_postdata();
	?>

	// PHPで生成した$songs変数をJavaScriptに渡す
	var songs = <?php echo json_encode($songs); ?>;
	window.onload = function() {
		updateCurrentSongInfo();
	};
</script>



<script>
	document.addEventListener('DOMContentLoaded', function () {
		const buttons = document.querySelectorAll('.copy-button');
		buttons.forEach(button => {
			button.addEventListener('click', function () {
				const text = this.getAttribute('data-copytext');
				navigator.clipboard.writeText(text).then(() => {
					alert('コピーしました');
				});
			});
		});
	});
</script>



<div id="sticky-player">

<div id="current-song-info">
	<img id="current-song-icon" src="<?php echo esc_url($songs[0]['icon']); ?>" alt="Icon">
	<span id="current-song-details"><?php echo esc_html($songs[0]['artist'] . ' - ' . $songs[0]['title']); ?></span>
</div>

	<iframe id="youtube-player" src="https://www.youtube.com/embed/<?php echo esc_attr($video_id); ?>?enablejsapi=1" frameborder="0" allowfullscreen></iframe>


<div id="progress-container" onclick="seekVideo(event)">
	<div id="progress-bar"></div>
</div>


	<div id="player-controls" style="!display: none;">
		<button id="prev-button"><i class="fas fa-step-backward"></i></button>
		<button id="play-pause-button"><i class="fas fa-play"></i></button>
		<button id="next-button"><i class="fas fa-step-forward"></i></button>
		<span id="time-display">00:00 / 00:00</span>
		<input type="range" id="volume-slider" min="0" max="100" value="50">
		<button id="toggle-visibility-button"><i class="fas fa-eye"></i></button>
	</div>

</div>

<hr>
<p><i class="fa-regular fa-circle-play"></i></p>
<p><i class="fa-regular fa-circle-play play-icon"></i></p>
<hr>


<hr>


<style>
.post-item {
	display: flex;
	align-items: flex-start;
	margin-bottom: 20px;
}

.post-style-bar {
	flex: 0 0 5px;
	width: 5px;
	height: 60px;
	margin-right: 8px;
	border-radius: 2px;
}

.post-thumbnail {
	flex: 0 0 120px; /* サムネールの幅を調整 */
	margin-right: 10px;
}

.post-content {
	flex: 1;
}


#current-song-info {
	display: flex;
	align-items: center;
	background-color: #f3f3f3;
	margin: 0 0 2px 0;
	padding: 4px;
}

#current-song-icon {
	width: 50px;
	height: 50px;
}

#current-song-details {
	margin-left: 10px;
}


.copy-button {
	display: inline-block;
	background-color: #e0e0e0;
	border: 1px solid #ccc;
	margin-left: 6px;
	padding: 2px 6px;
	cursor: pointer;
	font-size: 0.7rem;
	border-radius: 4px;
	vertical-align: middle;
	transition: background-color 0.2s ease;
}
.copy-button:hover {
	background-color: #d0d0d0;
}

.song-playlist-names {
	margin-left: 6px;
	font-size: 0.85rem;
	vertical-align: middle;
}

/* 日本語説明アイコン・モーダル */
.jp-desc-icon-btn {
	display: inline-flex;
	align-items: center;
	vertical-align: middle;
	margin-left: 4px;
	padding: 0;
	border: none;
	background: none;
	cursor: pointer;
}
.jp-desc-icon {
	width: 18px;
	height: 18px;
	opacity: 0.85;
}
.jp-desc-icon-btn:hover .jp-desc-icon {
	opacity: 1;
}
.jp-desc-content-src {
	position: absolute;
	left: -9999px;
}
.jp-desc-modal {
	display: none;
	position: fixed;
	z-index: 10001;
	left: 0;
	top: 0;
	width: 100%;
	height: 100%;
	overflow: auto;
}
.jp-desc-modal-overlay {
	position: fixed;
	left: 0;
	top: 0;
	width: 100%;
	height: 100%;
	background-color: rgba(0, 0, 0, 0.5);
	cursor: pointer;
}
.jp-desc-modal-content {
	position: relative;
	background-color: #fff;
	margin: 5% auto;
	padding: 1.5rem;
	max-width: 90%;
	width: 560px;
	max-height: 80vh;
	overflow-y: auto;
	border-radius: 8px;
	box-shadow: 0 4px 20px rgba(0,0,0,0.2);
	pointer-events: auto;
}
.jp-desc-modal-body {
	white-space: pre-wrap;
	word-wrap: break-word;
	line-height: 1.6;
	font-size: 0.95rem;
}

/* artistinfo: 写真左・説明＋ACF右 */
.artistinfo-wrapper {
	display: flex;
	gap: 1.5rem;
	align-items: flex-start;
	margin: 1em 0;
}
.artistinfo-left {
	flex: 0 0 auto;
	text-align: center;
	width: 200px;
	max-width: 100%;
	box-sizing: border-box;
}
.artistinfo-left .artistinfo-image {
	display: block;
	max-width: 200px;
	width: 100%;
	height: auto;
	border-radius: 6px;
	margin-left: auto;
	margin-right: auto;
}
.artistinfo-left .artistinfo-jpname-below-photo {
	margin: 0.5em 0 0 0;
	font-size: 0.95rem;
	line-height: 1.4;
	text-align: center;
	overflow-wrap: break-word;
	word-wrap: break-word;
}
.artistinfo-left .artistinfo-occupation-below-photo {
	margin: 0.5em 0 0 0;
	font-size: 0.9rem;
	line-height: 1.4;
	text-align: center;
	overflow-wrap: break-word;
	word-wrap: break-word;
}
.artistinfo-songs-above-genre {
	margin: 0.5em 0;
	text-align: left;
}
.artistinfo-right {
	flex: 1;
	min-width: 0;
}
.artistinfo-right .artistinfo-description {
	margin: 0 0 0.5em 0;
}
.artistinfo-right .artistinfo-songs {
	margin: 0 0 0.5em 0;
}
.artistinfo-acf {
	margin: 0.5em 0 0 0;
	padding: 0;
}
.artistinfo-acf .artistinfo-row {
	margin: 1em 0;
	font-size: 0.95rem;
	line-height: 1.5;
}
.artistinfo-acf .artistinfo-row:first-child {
	margin-top: 0;
}
.artistinfo-acf .artistinfo-external-links {
	margin-top: 1em;
	display: flex;
	flex-direction: column;
	gap: 0.4em;
}
.artistinfo-external-links .artistinfo-ext-link {
	display: inline-flex;
	align-items: center;
	gap: 0.35em;
	text-decoration: none;
	color: inherit;
	vertical-align: middle;
}
.artistinfo-external-links .artistinfo-ext-link:hover {
	text-decoration: underline;
}
.artistinfo-external-links .artistinfo-ext-icon {
	width: 24px;
	height: 24px;
	object-fit: contain;
	flex-shrink: 0;
}

</style>





	</div>
</main>

<?php get_template_part('inc/playlist-modal'); ?>

<!-- 日本語説明モーダル -->
<div id="jp-desc-modal" class="jp-desc-modal" aria-hidden="true">
	<div class="jp-desc-modal-overlay"></div>
	<div class="jp-desc-modal-content">
		<div class="jp-desc-modal-body"></div>
	</div>
</div>

<script>
(function() {
	const jpModal = document.getElementById('jp-desc-modal');
	const jpModalBody = jpModal ? jpModal.querySelector('.jp-desc-modal-body') : null;
	const jpModalOverlay = jpModal ? jpModal.querySelector('.jp-desc-modal-overlay') : null;
	document.querySelectorAll('.jp-desc-icon-btn').forEach(function(btn) {
		btn.addEventListener('click', function(e) {
			e.preventDefault();
			e.stopPropagation();
			var id = this.getAttribute('data-modal-target');
			var src = id ? document.getElementById(id) : null;
			if (jpModal && jpModalBody && src) {
				jpModalBody.textContent = src.textContent;
				jpModal.setAttribute('aria-hidden', 'false');
				jpModal.style.display = 'block';
			}
		});
	});
	function closeJpModal() {
		if (jpModal) {
			jpModal.setAttribute('aria-hidden', 'true');
			jpModal.style.display = 'none';
		}
	}
	if (jpModalOverlay) jpModalOverlay.addEventListener('click', closeJpModal);
	if (jpModal) jpModal.addEventListener('click', function(e) { if (e.target === jpModal) closeJpModal(); });
})();
</script>

<?php get_footer(); ?>
