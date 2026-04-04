'use client';

import { useCallback, useEffect, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

const RATINGS = [-2, -1, 0, 1, 2] as const;

export type SiteFeedbackModalProps = {
  open: boolean;
  onClose: () => void;
  roomId?: string;
  displayName?: string;
};

type Step = 'input' | 'confirm' | 'thanks';

export function SiteFeedbackModal({
  open,
  onClose,
  roomId,
  displayName,
}: SiteFeedbackModalProps) {
  const [step, setStep] = useState<Step>('input');
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep('input');
    setRating(0);
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
      setStep('thanks');
    } catch {
      setError('送信に失敗しました。');
    } finally {
      setSending(false);
    }
  }, [rating, comment, roomId, displayName]);

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
              <div className="flex flex-wrap gap-3">
                {RATINGS.map((v) => (
                  <label
                    key={v}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-gray-600 bg-gray-800/80 px-2.5 py-1.5 text-sm text-gray-200 has-[:checked]:border-amber-500 has-[:checked]:bg-amber-950/40"
                  >
                    <input
                      type="radio"
                      name="site-feedback-rating"
                      value={v}
                      checked={rating === v}
                      onChange={() => setRating(v)}
                      className="border-gray-500 text-amber-500 focus:ring-amber-500"
                    />
                    <span>{v > 0 ? `+${v}` : String(v)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
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
                <dd className="text-gray-100">{rating > 0 ? `+${rating}` : String(rating)}</dd>
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
