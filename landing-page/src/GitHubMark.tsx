import type { ImgHTMLAttributes } from 'react';

const GITHUB_MARK_SRC = '/GitHub_Invertocat_Black.svg';

/**
 * Official GitHub Invertocat (static asset). Black artwork is inverted for contrast on matrix green / dark gray.
 */
export function GitHubMark({
  className = '',
  ...rest
}: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'>) {
  return (
    <img
      src={GITHUB_MARK_SRC}
      alt=""
      className={`h-5 w-5 shrink-0 brightness-0 invert ${className}`.trim()}
      {...rest}
    />
  );
}
