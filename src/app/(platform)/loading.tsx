import { AmrynLoader } from '@/components/shell/amryn-loader';

/**
 * What the client area shows while a page is on its way.
 *
 * This used to be a skeleton shaped like a generic dashboard — four tiles and
 * two panels — which was a reasonable guess and wrong on most of the routes it
 * covered. A skeleton that does not match the page it precedes is worse than
 * no skeleton: the layout visibly rearranges itself the moment the real
 * content lands, which reads as a glitch rather than as loading.
 *
 * The mark is honest instead. It says the platform is fetching something,
 * it is recognisably Amryn, and it does not promise a shape it cannot keep.
 */
export default function Loading() {
  return <AmrynLoader />;
}
