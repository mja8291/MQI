import type { AnchorHTMLAttributes } from 'react';
import { Link as RouterLink } from 'react-router';

/** next/link on React Router: same `href` prop as v1. */
export default function Link({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) {
  const { prefetch: _prefetch, ...rest } = props as typeof props & { prefetch?: boolean };
  return <RouterLink to={href} {...rest} />;
}
