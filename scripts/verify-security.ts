import assert from 'node:assert/strict';
import { isAllowedOrigin, isPrivateOrTailscaleIp, normalizeIp, resolveClientIp, verifyTurnstile } from '../src/server/security/edge.ts';

assert.equal(isPrivateOrTailscaleIp('10.1.0.9'), true);
assert.equal(isPrivateOrTailscaleIp('172.18.0.5'), true);
assert.equal(isPrivateOrTailscaleIp('100.79.150.79'), true);
assert.equal(isPrivateOrTailscaleIp('8.8.8.8'), false);
assert.equal(isAllowedOrigin('http://100.79.150.79:4400', 'https://aversa.sman1gedeg.sch.id', false), true);
assert.equal(isAllowedOrigin('http://172.18.0.5:4400', 'https://aversa.sman1gedeg.sch.id', false), true);
assert.equal(isAllowedOrigin('http://10.1.0.9:4400', 'https://aversa.sman1gedeg.sch.id', false), true);
assert.equal(isAllowedOrigin('https://evil.example', 'https://aversa.sman1gedeg.sch.id', false), false);

assert.equal(normalizeIp('::ffff:45.198.149.181'), '45.198.149.181');
assert.equal(normalizeIp('1.2.3.4, 8.8.8.8'), null);
assert.equal(resolveClientIp('192.0.2.20', '198.51.100.9', ['45.198.149.181']), '192.0.2.20');
assert.equal(resolveClientIp('45.198.149.181', '198.51.100.9', ['45.198.149.181']), '198.51.100.9');
assert.equal(resolveClientIp('45.198.149.181', '198.51.100.9, 192.0.2.3', ['45.198.149.181']), null);
const reply = (data: unknown) => (async () => new Response(JSON.stringify(data), { status: 200 })) as typeof fetch;
const call = (data: unknown, action = 'checkout', host = 'aversa.sman1gedeg.sch.id') => verifyTurnstile('token', action, host, '198.51.100.9', 'secret', reply(data));
assert.equal(await call({success: true, action: 'checkout', hostname: 'aversa.sman1gedeg.sch.id'}), true);
assert.equal(await call({success: true, action: 'wallet', hostname: 'aversa.sman1gedeg.sch.id'}), false);
assert.equal(await call({success: true, action: 'checkout', hostname: 'other.example'}), false);
assert.equal(await call({success: false, action: 'checkout', hostname: 'aversa.sman1gedeg.sch.id'}), false);
assert.equal(await verifyTurnstile('', 'checkout', 'aversa.sman1gedeg.sch.id', '198.51.100.9', 'secret', reply({success:true})), false);
assert.equal(await verifyTurnstile('token', 'checkout', 'aversa.sman1gedeg.sch.id', '198.51.100.9', 'secret', (async () => { throw new Error('offline'); }) as typeof fetch), false);
console.log('Security checks passed');
