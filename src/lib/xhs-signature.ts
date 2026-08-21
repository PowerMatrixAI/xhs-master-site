function add32(a: number, b: number) {
  return (a + b) & 0xffffffff;
}

function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
  a = add32(add32(a, q), add32(x, t));
  return add32((a << s) | (a >>> (32 - s)), b);
}

function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
  return cmn((b & c) | (~b & d), a, b, x, s, t);
}

function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
  return cmn((b & d) | (c & ~d), a, b, x, s, t);
}

function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
  return cmn(b ^ c ^ d, a, b, x, s, t);
}

function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
  return cmn(c ^ (b | ~d), a, b, x, s, t);
}

function md5cycle(state: number[], block: number[]) {
  let [a, b, c, d] = state;

  a = ff(a, b, c, d, block[0], 7, -680876936);
  d = ff(d, a, b, c, block[1], 12, -389564586);
  c = ff(c, d, a, b, block[2], 17, 606105819);
  b = ff(b, c, d, a, block[3], 22, -1044525330);
  a = ff(a, b, c, d, block[4], 7, -176418897);
  d = ff(d, a, b, c, block[5], 12, 1200080426);
  c = ff(c, d, a, b, block[6], 17, -1473231341);
  b = ff(b, c, d, a, block[7], 22, -45705983);
  a = ff(a, b, c, d, block[8], 7, 1770035416);
  d = ff(d, a, b, c, block[9], 12, -1958414417);
  c = ff(c, d, a, b, block[10], 17, -42063);
  b = ff(b, c, d, a, block[11], 22, -1990404162);
  a = ff(a, b, c, d, block[12], 7, 1804603682);
  d = ff(d, a, b, c, block[13], 12, -40341101);
  c = ff(c, d, a, b, block[14], 17, -1502002290);
  b = ff(b, c, d, a, block[15], 22, 1236535329);

  a = gg(a, b, c, d, block[1], 5, -165796510);
  d = gg(d, a, b, c, block[6], 9, -1069501632);
  c = gg(c, d, a, b, block[11], 14, 643717713);
  b = gg(b, c, d, a, block[0], 20, -373897302);
  a = gg(a, b, c, d, block[5], 5, -701558691);
  d = gg(d, a, b, c, block[10], 9, 38016083);
  c = gg(c, d, a, b, block[15], 14, -660478335);
  b = gg(b, c, d, a, block[4], 20, -405537848);
  a = gg(a, b, c, d, block[9], 5, 568446438);
  d = gg(d, a, b, c, block[14], 9, -1019803690);
  c = gg(c, d, a, b, block[3], 14, -187363961);
  b = gg(b, c, d, a, block[8], 20, 1163531501);
  a = gg(a, b, c, d, block[13], 5, -1444681467);
  d = gg(d, a, b, c, block[2], 9, -51403784);
  c = gg(c, d, a, b, block[7], 14, 1735328473);
  b = gg(b, c, d, a, block[12], 20, -1926607734);

  a = hh(a, b, c, d, block[5], 4, -378558);
  d = hh(d, a, b, c, block[8], 11, -2022574463);
  c = hh(c, d, a, b, block[11], 16, 1839030562);
  b = hh(b, c, d, a, block[14], 23, -35309556);
  a = hh(a, b, c, d, block[1], 4, -1530992060);
  d = hh(d, a, b, c, block[4], 11, 1272893353);
  c = hh(c, d, a, b, block[7], 16, -155497632);
  b = hh(b, c, d, a, block[10], 23, -1094730640);
  a = hh(a, b, c, d, block[13], 4, 681279174);
  d = hh(d, a, b, c, block[0], 11, -358537222);
  c = hh(c, d, a, b, block[3], 16, -722521979);
  b = hh(b, c, d, a, block[6], 23, 76029189);
  a = hh(a, b, c, d, block[9], 4, -640364487);
  d = hh(d, a, b, c, block[12], 11, -421815835);
  c = hh(c, d, a, b, block[15], 16, 530742520);
  b = hh(b, c, d, a, block[2], 23, -995338651);

  a = ii(a, b, c, d, block[0], 6, -198630844);
  d = ii(d, a, b, c, block[7], 10, 1126891415);
  c = ii(c, d, a, b, block[14], 15, -1416354905);
  b = ii(b, c, d, a, block[5], 21, -57434055);
  a = ii(a, b, c, d, block[12], 6, 1700485571);
  d = ii(d, a, b, c, block[3], 10, -1894986606);
  c = ii(c, d, a, b, block[10], 15, -1051523);
  b = ii(b, c, d, a, block[1], 21, -2054922799);
  a = ii(a, b, c, d, block[8], 6, 1873313359);
  d = ii(d, a, b, c, block[15], 10, -30611744);
  c = ii(c, d, a, b, block[6], 15, -1560198380);
  b = ii(b, c, d, a, block[13], 21, 1309151649);
  a = ii(a, b, c, d, block[4], 6, -145523070);
  d = ii(d, a, b, c, block[11], 10, -1120210379);
  c = ii(c, d, a, b, block[2], 15, 718787259);
  b = ii(b, c, d, a, block[9], 21, -343485551);

  state[0] = add32(a, state[0]);
  state[1] = add32(b, state[1]);
  state[2] = add32(c, state[2]);
  state[3] = add32(d, state[3]);
}

function md5blk(bytes: Uint8Array, offset: number) {
  const out = new Array<number>(16);
  for (let i = 0; i < 16; i += 1) {
    const index = offset + i * 4;
    out[i] =
      (bytes[index] || 0) |
      ((bytes[index + 1] || 0) << 8) |
      ((bytes[index + 2] || 0) << 16) |
      ((bytes[index + 3] || 0) << 24);
  }
  return out;
}

function rhex(value: number) {
  let out = "";
  for (let i = 0; i < 4; i += 1) {
    out += (`0${((value >> (i * 8)) & 0xff).toString(16)}`).slice(-2);
  }
  return out;
}

function md5HexBytes(bytes: Uint8Array) {
  const state = [1732584193, -271733879, -1732584194, 271733878];

  let offset = 0;
  for (; offset + 64 <= bytes.length; offset += 64) {
    md5cycle(state, md5blk(bytes, offset));
  }

  const tail = new Array<number>(16).fill(0);
  let tailIndex = 0;
  for (; offset < bytes.length; offset += 1, tailIndex += 1) {
    tail[tailIndex >> 2] |= bytes[offset] << ((tailIndex % 4) * 8);
  }
  tail[tailIndex >> 2] |= 0x80 << ((tailIndex % 4) * 8);

  if (tailIndex > 55) {
    md5cycle(state, tail);
    tail.fill(0);
  }

  tail[14] = bytes.length * 8;
  md5cycle(state, tail);

  return state.map(rhex).join("");
}

function concatBytes(...chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function last8(value: string) {
  return value.length <= 8 ? value : value.slice(-8);
}

export function createXhsRequestTime() {
  return Math.floor(Date.now() / 1000).toString();
}

export function createXhsRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function toRequestUri(urlOrPath: string) {
  try {
    const url = new URL(urlOrPath);
    return `${url.pathname}${url.search}`;
  } catch {
    return urlOrPath.startsWith("/") ? urlOrPath : `/${urlOrPath}`;
  }
}

export function buildXhsSignature(input: {
  method: string;
  requestUri: string;
  body?: string | Uint8Array;
  requestId: string;
  token: string;
  uid: string;
  time: string;
}) {
  const body = typeof input.body === "string"
    ? input.body && input.body !== "\"\"" ? new TextEncoder().encode(input.body) : null
    : input.body && input.body.length ? input.body : null;
  const suffix = new TextEncoder().encode([
    input.requestUri,
    input.requestId,
    last8(input.token),
    input.uid,
    input.time
  ].join(""));
  return md5HexBytes(body ? concatBytes(body, suffix) : suffix);
}

export function buildProxyAuthHeaders(input: {
  token: string;
  uid: string;
  time?: string;
  requestId?: string;
  test?: string;
}) {
  const time = input.time || createXhsRequestTime();
  const requestId = input.requestId || createXhsRequestId();
  return {
    "Xhs-Sign": input.token,
    "Xhs-Person": input.uid,
    "Xhs-Time": time,
    "Xhs-Request-Id": requestId,
    "Xhs-Test": input.test || "1"
  };
}

export function buildBackendSignedHeaders(input: {
  url: string;
  method: string;
  token: string;
  uid: string;
  time?: string;
  requestId?: string;
  test?: string;
  body?: string | Uint8Array;
  includeJsonContentType?: boolean;
}) {
  const baseHeaders = buildProxyAuthHeaders(input);
  const requestUri = toRequestUri(input.url);
  const signature = buildXhsSignature({
    method: input.method,
    requestUri,
    body: input.body,
    requestId: baseHeaders["Xhs-Request-Id"],
    token: input.token,
    uid: input.uid,
    time: baseHeaders["Xhs-Time"]
  });

  return {
    ...(input.includeJsonContentType === false ? {} : { "Content-Type": "application/json" }),
    "Xhs-Language": "zh-cn",
    ...baseHeaders,
    "Xhs-Signature": signature
  };
}
