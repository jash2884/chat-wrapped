// A small DEFLATE decoder (RFC 1951), used when the browser has no
// DecompressionStream("deflate-raw"): older Android WebViews, some in-app
// browsers and older Samsung Internet versions. Follows zlib's reference "puff".

const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

// Canonical Huffman table: how many codes of each length, and the symbols in code order.
function huffman(lengths) {
  const count = new Uint16Array(16), offs = new Uint16Array(16);
  for (const l of lengths) count[l]++;
  count[0] = 0;
  for (let len = 1; len < 15; len++) offs[len + 1] = offs[len] + count[len];
  const symbol = new Uint16Array(lengths.length);
  lengths.forEach((l, s) => { if (l) symbol[offs[l]++] = s; });
  return { count, symbol };
}

let FIXED = null;
function fixedTables() {
  if (!FIXED) {
    const l = new Uint8Array(288);
    l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288);
    FIXED = { lit: huffman(l), dist: huffman(new Uint8Array(30).fill(5)) };
  }
  return FIXED;
}

export function inflateRaw(input) {
  let pos = 0, bitbuf = 0, bitcnt = 0;
  let out = new Uint8Array(Math.max(1024, input.length * 4)), len = 0;

  const need = (n) => {
    if (len + n <= out.length) return;
    let size = out.length * 2;
    while (size < len + n) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(out.subarray(0, len));
    out = grown;
  };
  const bits = (n) => {
    let val = bitbuf;
    while (bitcnt < n) {
      if (pos >= input.length) throw new Error("The compressed data ended early. The zip may be incomplete.");
      val |= input[pos++] << bitcnt;
      bitcnt += 8;
    }
    bitbuf = val >>> n;
    bitcnt -= n;
    return val & ((1 << n) - 1);
  };
  const decode = (h) => {
    let code = 0, first = 0, index = 0;
    for (let l = 1; l <= 15; l++) {
      code |= bits(1);
      const count = h.count[l];
      if (code - count < first) return h.symbol[index + (code - first)];
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new Error("The compressed data is corrupt.");
  };
  const codes = (lit, dist) => {
    for (;;) {
      const sym = decode(lit);
      if (sym < 256) { need(1); out[len++] = sym; continue; }
      if (sym === 256) return;
      const s = sym - 257;
      if (s >= 29) throw new Error("The compressed data is corrupt.");
      const n = LBASE[s] + bits(LEXT[s]);
      const d = decode(dist);
      if (d >= 30) throw new Error("The compressed data is corrupt.");
      const back = DBASE[d] + bits(DEXT[d]);
      if (back > len) throw new Error("The compressed data is corrupt.");
      need(n);
      for (let i = 0; i < n; i++, len++) out[len] = out[len - back]; // copies may overlap
    }
  };

  let last;
  do {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      bitbuf = 0; bitcnt = 0; // stored blocks start on a byte boundary
      if (pos + 4 > input.length) throw new Error("The compressed data ended early.");
      const n = input[pos] | (input[pos + 1] << 8), check = input[pos + 2] | (input[pos + 3] << 8);
      if (n !== (~check & 0xffff)) throw new Error("The compressed data is corrupt.");
      pos += 4;
      if (pos + n > input.length) throw new Error("The compressed data ended early.");
      need(n);
      out.set(input.subarray(pos, pos + n), len);
      pos += n; len += n;
    } else if (type === 1) {
      const f = fixedTables();
      codes(f.lit, f.dist);
    } else if (type === 2) {
      const nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4;
      const cl = new Uint8Array(19);
      for (let i = 0; i < ncode; i++) cl[ORDER[i]] = bits(3);
      const clh = huffman(cl);
      const lengths = new Uint8Array(nlen + ndist);
      for (let i = 0; i < nlen + ndist;) {
        const sym = decode(clh);
        if (sym < 16) { lengths[i++] = sym; continue; }
        let rep, val = 0;
        if (sym === 16) { if (!i) throw new Error("The compressed data is corrupt."); val = lengths[i - 1]; rep = 3 + bits(2); }
        else rep = sym === 17 ? 3 + bits(3) : 11 + bits(7);
        if (i + rep > nlen + ndist) throw new Error("The compressed data is corrupt.");
        while (rep--) lengths[i++] = val;
      }
      codes(huffman(lengths.subarray(0, nlen)), huffman(lengths.subarray(nlen)));
    } else throw new Error("The compressed data is corrupt.");
  } while (!last);
  return out.subarray(0, len);
}
