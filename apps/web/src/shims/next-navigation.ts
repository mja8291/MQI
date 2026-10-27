import { useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams as useRRSearchParams } from 'react-router';

/**
 * The slice of next/navigation the ported v1 screens use, on React Router. Keeping v1's calls
 * (router.push / replace / back) unchanged keeps the ported screens line-for-line comparable.
 */
export function useRouter() {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      push: (to: string) => void navigate(to),
      replace: (to: string) => void navigate(to, { replace: true }),
      back: () => void navigate(-1),
      refresh: () => undefined,
      prefetch: () => undefined,
    }),
    [navigate],
  );
}

export function usePathname(): string {
  return useLocation().pathname.replace(/\/+$/, '') || '/';
}

export function useSearchParams(): URLSearchParams {
  return useRRSearchParams()[0];
}
