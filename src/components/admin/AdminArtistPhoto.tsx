type Props = {
  url: string | null | undefined;
  name: string;
  size?: number;
};

export function AdminArtistPhoto({ url, name, size = 48 }: Props) {
  const src = (url ?? '').trim();
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name.trim() ? `${name} の写真` : ''}
      width={size}
      height={size}
      className="shrink-0 rounded bg-gray-800 object-cover"
      style={{ width: size, height: size }}
    />
  );
}
