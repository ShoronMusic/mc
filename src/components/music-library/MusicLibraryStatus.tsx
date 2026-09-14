export function MusicLibraryUnavailable() {
  return (
    <p className="text-sm text-gray-400">カタログを表示できません。データベース設定を確認してください。</p>
  );
}

export function MusicLibraryEmpty({ children }: { children: string }) {
  return <p className="text-sm text-gray-400">{children}</p>;
}
