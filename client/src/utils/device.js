export function detectDevice() {
  const ua = navigator.userAgent;
  let type = 'desktop';
  if (/tablet|ipad/i.test(ua)) type = 'tablet';
  else if (/mobile|iphone|android/i.test(ua)) type = 'mobile';

  let browser = 'Browser';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/chrome\//i.test(ua)) browser = 'Chrome';
  else if (/firefox\//i.test(ua)) browser = 'Firefox';
  else if (/safari\//i.test(ua)) browser = 'Safari';

  let os = '';
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/mac os/i.test(ua)) os = 'Mac';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad|ios/i.test(ua)) os = 'iOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  return { type, name: os ? `${browser} on ${os}` : browser };
}
