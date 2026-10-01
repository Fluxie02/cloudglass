'use strict';

// Third-party tracking, analytics, advertising and identity-sync domains.
//
// The first group was observed on soundcloud.com while testing Cloudglass
// (logged out, before any cookie choice was made). The rest are the same kinds
// of services from common networks, listed so a SoundCloud change doesn't
// silently re-enable tracking.
//
// Matching is by domain suffix: "doubleclick.net" also blocks
// "securepubads.g.doubleclick.net". Nothing SoundCloud needs to work is listed:
// soundcloud.com, sndcdn.com, the cookie-consent dialog (cookielaw.org) and the
// Google / Apple / Facebook sign-in pages are never blocked.
const TRACKER_DOMAINS = [
  // Observed on soundcloud.com
  'google-analytics.com',
  'analytics.google.com',
  'googletagmanager.com',
  'googletagservices.com',
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.com',
  'adtrafficquality.google',
  'analytics.tiktok.com',
  'analytics-sg.tiktok.com',
  'connect.facebook.net',
  'scorecardresearch.com',
  'quantserve.com',
  'quantcount.com',
  'alb.reddit.com',
  'redditstatic.com',
  'appsflyer.com',
  'appsflyersdk.com',
  'criteo.com',
  'criteo.net',
  'taboola.com',
  'outbrain.com',
  'amazon-adsystem.com',
  'publisher-services.amazon.dev',
  'ams-pageview-public.s3.amazonaws.com',
  'capi-automation.s3.us-east-2.amazonaws.com',
  'id5-sync.com',
  'crwdcntrl.net',
  'analytics.yahoo.com',
  'lijit.com',
  'fwmrm.net',
  'smartadserver.com',
  'fastclick.net',
  'htlbid.com',
  'aditude.io',
  'aditude.cloud',
  'script.ac',
  'clean.gg',

  // Same categories, other common networks
  'adnxs.com',
  'adsrvr.org',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'casalemedia.com',
  'bidswitch.net',
  '3lift.com',
  'sharethrough.com',
  'yieldmo.com',
  'teads.tv',
  'adform.net',
  'media.net',
  'moatads.com',
  'doubleverify.com',
  'adsafeprotected.com',
  'everesttech.net',
  'demdex.net',
  'omtrdc.net',
  'krxd.net',
  'bluekai.com',
  'exelator.com',
  'agkn.com',
  'rlcdn.com',
  'liadm.com',
  'tapad.com',
  'permutive.com',
  'permutive.app',
  'bat.bing.com',
  'clarity.ms',
  'hotjar.com',
  'hotjar.io',
  'mixpanel.com',
  'amplitude.com',
  'cdn.segment.com',
  'api.segment.io',
  'nr-data.net',
  'js-agent.newrelic.com',
  'browser-intake-datadoghq.com',
  'tr.snapchat.com',
  'sc-static.net',
  'static.ads-twitter.com',
  'analytics.twitter.com',
  'px.ads.linkedin.com',
  'snap.licdn.com',
  'ct.pinimg.com',
];

const blocked = new Set(TRACKER_DOMAINS);

function isTracker(url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  for (let h = host; h; ) {
    if (blocked.has(h)) return true;
    const dot = h.indexOf('.');
    if (dot < 0) break;
    h = h.slice(dot + 1);
  }
  return false;
}

module.exports = { isTracker, TRACKER_DOMAINS };
