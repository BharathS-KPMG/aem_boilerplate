/**
 * Marketing channel for lead forms, ported 1:1 from the source site
 * (asianpaints.com):
 *
 * - rememberVisit(): clientlib-base cookieUtmParams(). Keeps the visit's
 *   utm_source / utm_medium / utm_campaign / cid and the first page's
 *   referrer in sessionStorage. The source runs it on every page; here it
 *   runs when form-submit-common.js loads and again on submit, so nothing
 *   is added to pages without a lead form.
 * - getMarketingChannelDetails(): clientlib-baselanding-commonheader.
 *   Turns those values into { referrerId, marketingChannel }, which every
 *   lead sends to ccforms.saveleadform.json and
 *   salesforce.leadstosalesforce.json.
 */

const EMAIL = 'email';

const SOCIAL_NETWORKS = ['www.facebook.com', 'www.linkedin.com', 'www.twitter.com', 'plus.google.com',
  'www.orkut.com', 'www.friendster.com', 'www.livejournal.com', 'www.blogspot.com', 'www.wordpress.com',
  'www.friendfeed.com', 'www.myspace.com', 'www.digg.com', 'www.reddit.com', 'www.stumbleupon.com',
  'www.twine.com', 'www.yelp.com', 'www.mixx.com', 'www.delicious.com', 'www.tumblr.com', 'www.disqus.com',
  'www.intensedebate.com', 'www.plurk.com', 'www.slideshare.net', 'www.backtype.com', 'www.netvibes.com',
  'www.mister-wong.com', 'www.diigo.com', 'www.flixster.com', 'www.youtube.com', 'www.vimeo.com',
  'www.12seconds.tv', 'www.zooomr.com', 'www.identi.ca', 'www.jaiku.com', 'www.flickr.com', 'www.imeem.com',
  'www.dailymotion.com', 'www.photobucket.com', 'www.fotolog.com', 'www.smugmug.com', 'www.classmates.com',
  'www.myyearbook.com', 'www.mylife.com', 'www.tagged.com', 'www.brightkite.com', 'www.ning.com',
  'www.bebo.com', 'www.hi5.com', 'www.yuku.com', 'www.cafemom.com', 'www.xanga.com', 'www.pinterest.com',
  'www.instagram.com'];

/** URL params kept for the session (a new value replaces the stored one, as on the source). */
const VISIT_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'cid'];

/** Store this page's attribution for the session. Safe to call more than once. */
export function rememberVisit() {
  try {
    const params = new URLSearchParams(window.location.search);
    VISIT_PARAMS.forEach((key) => {
      const value = params.get(key);
      if (value) sessionStorage.setItem(key, value);
    });
    if (!(sessionStorage.getItem('initial_referrer') || '').trim()) {
      sessionStorage.setItem('initial_referrer', document.referrer);
    }
  } catch (e) { /* storage unavailable */ }
}

const stored = (key) => {
  try {
    return (sessionStorage.getItem(key) || '').toLowerCase().trim();
  } catch (e) {
    return '';
  }
};

/**
 * The visit's marketing channel, from the stored cid, utm_* and first referrer.
 * @returns {{referrerId: string, marketingChannel: string}}
 */
export function getMarketingChannelDetails() {
  // the source's header script has always stored this page's values by now
  rememberVisit();
  const cid = stored('cid');
  const source = stored('utm_source');
  const medium = stored('utm_medium');
  const referrer = stored('initial_referrer');
  let host = '';
  let origin = '';
  try {
    if (referrer) ({ host, origin } = new URL(referrer));
  } catch (e) { /* not a URL */ }

  let marketingChannel = '';
  if (cid) {
    if (cid.startsWith('ps')) marketingChannel = 'Paid Search';
    else if (cid.startsWith('em') || source.startsWith(EMAIL) || medium.startsWith(EMAIL)) marketingChannel = 'Email';
    else if (cid.startsWith('di')) marketingChannel = 'Display';
    else if (cid.startsWith('sm')) marketingChannel = 'Social Media';
    else if (cid.startsWith('af')) marketingChannel = 'Affiliates';
    else if (cid.startsWith('pa')) marketingChannel = 'Partners';
    else if (cid.startsWith('edm')) marketingChannel = 'eDM';
    else if (cid.startsWith('ms')) marketingChannel = 'SMS';
    else if (cid.startsWith('qr')) marketingChannel = 'QR Code';
    else if (cid.startsWith('mm')) marketingChannel = 'MMS';
  } else if (referrer) {
    if (referrer.includes('asianpaints.com')) marketingChannel = 'Internal';
    else if (SOCIAL_NETWORKS.includes(host)) marketingChannel = 'Social Networks';
    else if (/google\.|bing\.|yahoo\./.test(referrer)) marketingChannel = 'Natural Search';
    else marketingChannel = 'Referring Domains';
  } else {
    marketingChannel = 'Direct';
  }
  return { referrerId: origin, marketingChannel };
}
