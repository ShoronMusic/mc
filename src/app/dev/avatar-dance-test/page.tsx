import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './dance-test.module.css';

export const metadata: Metadata = {
  title: 'アバター踊りテスト',
  robots: { index: false, follow: false },
};

export default function AvatarDanceTestPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <p className="mb-6 text-sm text-white/50">
        <Link href="/" className="underline hover:text-white/80">
          トップへ
        </Link>
      </p>
      <h1 className="mb-2 text-xl font-semibold text-white">踊りテスト（CSS）</h1>
      <p className="mb-8 text-sm text-white/60">
        選曲者アバター演出のイメージ用。頭は円、胴は棒。腕・脚は上腕／前腕・太もも／すねの2段で肘・膝が曲がります。
      </p>

      <div className={styles.stage}>
        <div className={styles.character} aria-hidden>
          <div className={styles.head} />
          <div className={styles.torso} />
          <div className={`${styles.arm} ${styles.armLeft}`}>
            <div className={styles.upperArm}>
              <div className={styles.forearm} />
            </div>
          </div>
          <div className={`${styles.arm} ${styles.armRight}`}>
            <div className={styles.upperArm}>
              <div className={styles.forearm} />
            </div>
          </div>
          <div className={`${styles.leg} ${styles.legLeft}`}>
            <div className={styles.thigh}>
              <div className={styles.calf} />
            </div>
          </div>
          <div className={`${styles.leg} ${styles.legRight}`}>
            <div className={styles.thigh}>
              <div className={styles.calf} />
            </div>
          </div>
        </div>
        <div className={styles.shadow} aria-hidden />
        <p className={styles.caption}>
          アニメは約 0.45 秒周期の無限ループです。実装では再生状態や BPM
          と同期させることができます。
        </p>
      </div>
    </main>
  );
}
