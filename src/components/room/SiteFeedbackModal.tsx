'use client';

import { useCallback, useEffect, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

const RATINGS = [-2, -1, 0, 1, 2] as const;
const RATING_EMOJIS: Record<(typeof RATINGS)[number], string> = {
  [-2]: '😡',
  [-1]: '😟',
  [0]: '😐',
  [1]: '🙂',
  [2]: '😄',
};
const PAIN_POINT_OPTIONS = [
  '入室方法',
  'YouTube URL貼り付け',
  'AIへの質問方法',
  '画面の見方',
  '特になし',
] as const;

export type SiteFeedbackModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
  roomId?: string;
  displayName?: string;
};

type Step = 'input' | 'confirm' | 'thanks';

export function SiteFeedbackModal({
  open,
  onClose,
  onSubmitted,
  roomId,
  displayName,
}: SiteFeedbackModalProps) {
  const [step, setStep] = useState<Step>('input');
  const [rating, setRating] = useState<number>(0);
  const [painPoints, setPainPoints] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep('input');
    setRating(0);
    setPainPoints([]);
    setComment('');
    setSending(false);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  useEffect(() => {
    if (!open) return;
    setStep('input');
    setRating(0);
    setPainPoints([]);
    setComment('');
    setSending(false);
    setError(null);
  }, [open]);

  const goConfirm = useCallback(() => {
    setError(null);
    setStep('confirm');
  }, []);

  const goBackToInput = useCallback(() => {
    setStep('input');
    setError(null);
  }, []);

  const submit = useCallback(async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/site-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          painPoints: painPoints.length > 0 ? painPoints : undefined,
          comment: comment.trim() || undefined,
          roomId: roomId?.trim() || undefined,
          displayName: displayName?.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : '送信に失敗しました。');
        setSending(false);
        return;
      }
      onSubmitted?.();
      setStep('thanks');
    } catch {
      setError('送信に失敗しました。');
    } finally {
      setSending(false);
    }
  }, [rating, painPoints, comment, roomId, displayName, onSubmitted]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && step !== 'thanks' && !sending) handleClose();
      }}
    >
      <div
        className="relative w-full max-w-md rounded-xl border border-gray-600 bg-gray-900 p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="site-feedback-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => {
            if (sending) return;
            handleClose();
          }}
          className="absolute right-3 top-3 rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
          aria-label="閉じる"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>

        {step === 'input' && (
          <>
            <h2 id="site-feedback-title" className="pr-8 text-lg font-semibold text-white">
              サイトへのご意見
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              このチャットサイト全体の印象を、-2（とても悪い）〜2（とても良い）でお選びください。
            </p>
            <fieldset className="mt-4">
              <legend className="mb-2 text-xs font-medium text-gray-500">評価</legend>
              <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="評価">
                {RATINGS.map((v) => {
                  const isActive = rating === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => setRating(v)}
                      className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-sm transition ${
                        isActive
                          ? 'border-amber-500 bg-amber-950/40 text-amber-100'
                          : 'border-gray-600 bg-gray-800/80 text-gray-200 hover:border-gray-500 hover:bg-gray-800'
                      }`}
                    >
                      <span className="text-base leading-none" aria-hidden="true">
                        {RATING_EMOJIS[v]}
                      </span>
                      <span>{v > 0 ? `+${v}` : String(v)}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-medium text-gray-500">どこで迷いましたか（任意・複数選択）</span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PAIN_POINT_OPTIONS.map((option) => {
                  const checked = painPoints.includes(option);
                  return (
                    <label
                      key={option}
                      className={`flex cursor-pointer items-center gap-2 rounded border px-2.5 py-2 text-xs transition ${
                        checked
                          ? 'border-sky-500 bg-sky-950/30 text-sky-100'
                          : 'border-gray-600 bg-gray-800/60 text-gray-200 hover:border-gray-500'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            if (option === '特になし') {
                              setPainPoints(['特になし']);
                              return;
                            }
                            setPainPoints((prev) => [...prev.filter((p) => p !== '特になし'), option]);
                            return;
                          }
                          setPainPoints((prev) => prev.filter((p) => p !== option));
                        }}
                        className="h-4 w-4 rounded border-gray-500 bg-gray-900 text-sky-500 focus:ring-sky-500"
                      />
                      <span>{option}</span>
                    </label>
                  );
                })}
              </div>
            </label>
            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-medium text-gray-500">自由コメント（任意）</span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, 2000))}
                rows={4}
                className="w-full resize-y rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500"
                placeholder="改善してほしい点、嬉しかった点など"
                maxLength={2000}
              />
              <span className="mt-0.5 block text-right text-[10px] text-gray-500">{comment.length}/2000</span>
            </label>
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={goConfirm}
                className="rounded border border-amber-600 bg-amber-900/50 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-800/60"
              >
                確認へ
              </button>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <>
            <h2 id="site-feedback-title" className="pr-8 text-lg font-semibold text-white">
              送信内容の確認
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-gray-500">評価</dt>
                <dd className="inline-flex items-center gap-2 text-gray-100">
                  <span className="text-base leading-none" aria-hidden="true">
                    {RATING_EMOJIS[rating as (typeof RATINGS)[number]]}
                  </span>
                  <span>{rating > 0 ? `+${rating}` : String(rating)}</span>
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">迷った点</dt>
                <dd className="text-gray-100">
                  {painPoints.length > 0 ? painPoints.join(' / ') : '（なし）'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">コメント</dt>
                <dd className="whitespace-pre-wrap text-gray-100">
                  {comment.trim() ? comment.trim() : '（なし）'}
                </dd>
              </div>
            </dl>
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={goBackToInput}
                disabled={sending}
                className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 disabled:opacity-50"
              >
                戻る
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={sending}
                className="rounded border border-amber-600 bg-amber-900/50 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-800/60 disabled:opacity-50"
              >
                {sending ? '送信中…' : '送信'}
              </button>
            </div>
          </>
        )}

        {step === 'thanks' && (
          <>
            <h2 id="site-feedback-title" className="pr-8 text-lg font-semibold text-emerald-200">
              送信完了
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-gray-200">
              貴重なご意見ありがとうございました。
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="rounded border border-gray-600 bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700"
              >
                閉じる
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
