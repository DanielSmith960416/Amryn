import { redirect } from 'next/navigation';

/**
 * The root of the application server, which is a way in rather than a page.
 *
 * This used to be a second marketing homepage — the same positioning, the same
 * "how it works" bands, the same closing call to action as the static site in
 * `docs/`. Two of them, maintained separately, free to drift apart, with the
 * one a stranger was actually linked to being the other one.
 *
 * There is one marketing site now: `docs/`, on GitHub Pages, whose "Open the
 * platform" button points here. So this address means "take me into the
 * platform", and it does exactly that.
 *
 * Only a signed-in reader ever reaches this component. `/` is no longer in the
 * middleware's exemptions, so a signed-out request is sent to /sign-in before
 * any of this renders, and signs in to arrive back here on its way through.
 *
 * The Command Centre rather than a dashboard index, because it is the screen
 * the product is built around and the one every other route leads back to. A
 * reader who has not finished their Imprint is moved on from there, which is
 * that screen's decision to make and not this one's.
 */
export default function PlatformEntry() {
  redirect('/command-centre');
}
