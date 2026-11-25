import assert from 'node:assert/strict';
import { isAllowedOrigin, isPrivateOrTailscaleIp, normalizeIp, resolveChallengeHostname, resolveClientIp, verifyTurnstile } from '../src/server/security/edge.ts';
import { convertStaticQrisToDynamic, isValidEmvQris } from '../src/server/sdk/qbiz.ts';

const sampleStaticQris = '00020101021138590014ID.CO.QRIS.WWW0215ID10200845344330303UMI51440014ID.CO.QRIS.WWW0215ID10200845344330303UMI5204581253033605802ID5920Resto Ayam Bakar Cbk6009Mojokerto610561300630448B5';
assert.equal(isValidEmvQris(sampleStaticQris), true);
const dynQris = convertStaticQrisToDynamic(sampleStaticQris, 50123);
assert.equal(isValidEmvQris(dynQris), true);
assert.equal(dynQris.includes('010212'), true);
assert.equal(dynQris.includes('540550123'), true);

assert.equal(isPrivateOrTailscaleIp('10.1.0.9'), true);
assert.equal(isPrivateOrTailscaleIp('172.18.0.5'), true);
assert.equal(isPrivateOrTailscaleIp('100.79.150.79'), true);
assert.equal(isPrivateOrTailscaleIp('8.8.8.8'), false);
assert.equal(isAllowedOrigin('http://100.79.150.79:4400', 'https://aversa.sman1gedeg.sch.id', false), true);
assert.equal(isAllowedOrigin('http://172.18.0.5:4400', 'https://aversa.sman1gedeg.sch.id', false), true);
assert.equal(isAllowedOrigin('http://10.1.0.9:4400', 'https://aversa.sman1gedeg.sch.id', false), true);
assert.equal(isAllowedOrigin('https://evil.example', 'https://aversa.sman1gedeg.sch.id', false), false);
assert.equal(resolveChallengeHostname('http://10.1.0.9:4400', '10.1.0.9:4400', 'https://aversa.sman1gedeg.sch.id', false), '10.1.0.9');
assert.equal(resolveChallengeHostname(undefined, '100.79.150.79:4400', 'https://aversa.sman1gedeg.sch.id', false), '100.79.150.79');
assert.equal(resolveChallengeHostname('https://evil.example', 'evil.example', 'https://aversa.sman1gedeg.sch.id', false), 'aversa.sman1gedeg.sch.id');

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
