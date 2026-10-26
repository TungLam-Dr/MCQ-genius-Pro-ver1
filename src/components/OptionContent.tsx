import type { MouseEvent } from 'react';

/** Works inside answer buttons as well as read-only answer cards. */
export function OptionContent({ text, images, letter, onZoom }: {
  text: string;
  images?: string[];
  letter: string;
  onZoom?: (src: string) => void;
}) {
  const zoom = (event: MouseEvent<HTMLImageElement>, src: string) => {
    if (!onZoom) return;
    event.preventDefault();
    event.stopPropagation();
    onZoom(src);
  };
  return <span className="block min-w-0 flex-1">
    {text && text !== 'Hình ảnh' ? <span className="block">{text}</span> : null}
    {images?.map((src, index) => <img key={index} src={src}
      alt={`Hình trong đáp án ${letter}${images.length > 1 ? `, ảnh ${index + 1}` : ''}`}
      loading="lazy" onClick={event => zoom(event, src)}
      className="mt-2 max-h-56 max-w-full rounded-lg border border-slate-200 bg-white object-contain dark:border-slate-700" />)}
    {!images?.length && !text ? <span>Không đọc được nội dung đáp án</span> : null}
  </span>;
}
