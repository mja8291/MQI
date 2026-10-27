import type { ImgHTMLAttributes } from 'react';

/** next/image as a plain <img> (the app is static; images are precached). */
export default function Image({ priority: _priority, ...props }: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean; src: string; alt: string }) {
  return <img {...props} />;
}
